// src/lib/artwork/server.ts
import "server-only";

import { S3Client, GetObjectCommand, PutObjectCommand, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

type UploadKind = "artwork" | "attachment";

function reqEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

const ACCOUNT_ID = reqEnv("R2_ACCOUNT_ID");
const ACCESS_KEY_ID = reqEnv("R2_ACCESS_KEY_ID");
const SECRET_ACCESS_KEY = reqEnv("R2_SECRET_ACCESS_KEY");
const BUCKET = reqEnv("R2_BUCKET_NAME");

const PREFIX = (process.env.R2_UPLOAD_PREFIX ?? "uploads").trim().replace(/^\/+|\/+$/g, "");
const PRESIGN_EXPIRES = Math.max(60, Number(process.env.R2_PRESIGN_EXPIRES_SECONDS ?? 900) || 900);

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
});

export type PresignPutResult = {
  key: string;
  url: string;
  headers: Record<string, string>;
  expiresIn: number;
};

export type PresignGetResult = {
  key: string;
  url: string;
  expiresIn: number;
};

export function safeBasename(name: string): string {
  const s = String(name ?? "").trim();
  const base = s.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "file";
}

export function normalizeContentType(ct: string | null | undefined): string {
  const v = String(ct ?? "").trim().toLowerCase();
  return v || "application/octet-stream";
}

export function assertAllowedContentType(ct: string): void {
  const v = normalizeContentType(ct);
  const ok =
    v === "application/pdf" ||
    v === "image/png" ||
    v === "image/jpeg" ||
    v === "image/webp" ||
    v === "image/tiff" ||
    v === "application/postscript" ||
    v === "application/octet-stream";
  if (!ok) throw new Error(`Unsupported contentType: ${v}`);
}

export function makeObjectKey(params: {
  kind: UploadKind;
  cartLineId?: string;
  productId?: string;
  userId?: string;
  filename: string;
}): string {
  const kind = params.kind;
  const file = safeBasename(params.filename);
  const ext = file.includes(".") ? file.split(".").pop()!.toLowerCase() : "bin";
  const rand = crypto.randomBytes(12).toString("hex"); // 24 chars
  const parts = [
    PREFIX,
    kind,
    params.productId ? `p_${params.productId}` : "p_unknown",
    params.userId ? `u_${params.userId}` : "u_anon",
    params.cartLineId ? `l_${params.cartLineId}` : "l_none",
    `${Date.now()}_${rand}.${ext}`,
  ];
  return parts.join("/");
}

export async function presignPut(input: {
  key: string;
  contentType: string;
  contentLength?: number | null;
}): Promise<PresignPutResult> {
  assertAllowedContentType(input.contentType);

  const putParams: PutObjectCommandInput = {
    Bucket: BUCKET,
    Key: input.key,
    ContentType: normalizeContentType(input.contentType),
    // NOTE: Cloudflare R2 ignores ACLs; keep object private by default.
  };

  const cmd = new PutObjectCommand(putParams);
  const url = await getSignedUrl(s3, cmd, { expiresIn: PRESIGN_EXPIRES });

  // Client must send Content-Type (and ideally Content-Length, but browsers vary)
  const headers: Record<string, string> = {
    "Content-Type": normalizeContentType(input.contentType),
  };

  return { key: input.key, url, headers, expiresIn: PRESIGN_EXPIRES };
}

export async function presignGet(input: {
  key: string;
  downloadFilename?: string | null;
}): Promise<PresignGetResult> {
  const safeName = input.downloadFilename ? safeBasename(input.downloadFilename) : null;

  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: input.key,
    ...(safeName
      ? {
          ResponseContentDisposition: `inline; filename="${safeName}"`,
        }
      : {}),
  });

  const url = await getSignedUrl(s3, cmd, { expiresIn: PRESIGN_EXPIRES });
  return { key: input.key, url, expiresIn: PRESIGN_EXPIRES };
}

/**
 * Persist an uploaded object to your cart tables.
 * Uses raw SQL so we don't depend on schema barrel exports.
 */
export async function attachToCartLine(input: {
  table: "cart_artwork" | "cart_attachments";
  cartLineId: string;
  key: string;
  url: string; // signed GET or proxy URL
  fileName: string;
  contentType?: string | null;
  side?: number | null; // only for cart_artwork
  label?: string | null; // only for cart_artwork
  kind?: string | null; // only for cart_attachments (defaults to 'attachment')
  meta?: unknown; // jsonb
}): Promise<void> {
  const meta = input.meta ?? {};
  const ct = input.contentType ? normalizeContentType(input.contentType) : null;

  if (input.table === "cart_artwork") {
    const side = Number.isFinite(input.side as number) ? Number(input.side) : 1;
    const label = (input.label ?? "").trim() || null;

    await db.execute(sql`
      insert into cart_artwork (cart_line_id, side, label, key, url, file_name, content_type, meta)
      values (${input.cartLineId}::uuid, ${side}, ${label}, ${input.key}, ${input.url}, ${safeBasename(
      input.fileName
    )}, ${ct}, ${meta}::jsonb)
    `);
    return;
  }

  const kind = (input.kind ?? "attachment").trim() || "attachment";
  await db.execute(sql`
    insert into cart_attachments (cart_line_id, kind, key, url, file_name, content_type, meta)
    values (${input.cartLineId}::uuid, ${kind}, ${input.key}, ${input.url}, ${safeBasename(
    input.fileName
  )}, ${ct}, ${meta}::jsonb)
  `);
}

/**
 * Record a completed upload in artwork_uploads.
 * We store `file_url` as the R2 key (private). Generate signed GET when needed.
 */
export async function recordArtworkUpload(input: {
  productId: string;
  orderId?: string | null;
  userId?: string | null;
  key: string; // stored in file_url (private key)
  fileName: string;
  fileSize?: number | null;
  fileType?: string | null;
  approved?: boolean | null;
}): Promise<void> {
  const approved = Boolean(input.approved ?? false);

  await db.execute(sql`
    insert into artwork_uploads (product_id, order_id, user_id, file_url, file_name, file_size, file_type, approved)
    values (${input.productId}, ${input.orderId ?? null}, ${input.userId ?? null}, ${input.key}, ${safeBasename(
    input.fileName
  )}, ${input.fileSize ?? null}, ${input.fileType ? normalizeContentType(input.fileType) : null}, ${approved})
  `);
}
