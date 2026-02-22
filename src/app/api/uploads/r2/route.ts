// src/app/api/uploads/r2/route.ts
import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ------------------------- helpers ------------------------- */
function s(v: unknown): string {
  return String(v ?? "").trim();
}

function readEnv(name: string): string {
  const v = s(process.env[name]);
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function readEnvOptional(name: string, fallback = ""): string {
  const v = s(process.env[name]);
  return v || fallback;
}

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function noStoreJson(req: NextRequest, body: unknown, status = 200) {
  const requestId = (body as any)?.requestId || getRequestId(req);
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function sanitizeFilename(name: string): string {
  const base = name
    .replace(/\\/g, "/")
    .split("/")
    .pop() || "file";
  // allow letters, numbers, dot, dash, underscore
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 160);
  return cleaned || "file";
}

function safePrefix(raw: string): string {
  return raw.replace(/^\/+|\/+$/g, "");
}

function joinKey(prefix: string, parts: string[]): string {
  const p = safePrefix(prefix);
  const rest = parts
    .map((x) => safePrefix(x))
    .filter(Boolean)
    .join("/");
  return [p, rest].filter(Boolean).join("/");
}

function buildPublicUrl(publicBase: string, key: string): string | null {
  const base = s(publicBase).replace(/\/+$/, "");
  if (!base) return null;
  // base must be a full URL
  try {
    const u = new URL(base);
    // ensure single slash
    return `${u.toString().replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
  } catch {
    return null;
  }
}

/* ------------------------- env + client ------------------------- */
const ACCOUNT_ID = readEnv("R2_ACCOUNT_ID");
const ACCESS_KEY_ID = readEnv("R2_ACCESS_KEY_ID");
const SECRET_ACCESS_KEY = readEnv("R2_SECRET_ACCESS_KEY");
const BUCKET = readEnv("R2_BUCKET_NAME");

const PUBLIC_BASE = readEnvOptional("R2_PUBLIC_BASE_URL", "").replace(/\/+$/, "");
const PREFIX = safePrefix(readEnvOptional("R2_UPLOAD_PREFIX", "uploads"));
const EXPIRES = (() => {
  const raw = readEnvOptional("R2_PRESIGN_EXPIRES_SECONDS", "900");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 3600 ? Math.trunc(n) : 900;
})();

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
});

/* ------------------------- schema ------------------------- */
const BodySchema = z
  .object({
    filename: z.string().min(1).max(300),
    contentType: z.string().min(1).max(200),
    // optional “folding” hint — you can pass lineId/cartId/orderId/etc
    scope: z.string().max(120).optional(),
    // optional: override default prefix (still sanitized)
    prefix: z.string().max(120).optional(),
  })
  .passthrough();

/**
 * POST /api/uploads/r2
 * Body: { filename, contentType, scope?, prefix? }
 *
 * Returns:
 * {
 *  ok, requestId,
 *  key,
 *  uploadUrl,   // presigned PUT
 *  publicUrl?   // only if R2_PUBLIC_BASE_URL set
 * }
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json ?? {});
    if (!parsed.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_body",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400,
      );
    }

    const body = parsed.data;

    const filename = sanitizeFilename(body.filename);
    const contentType = s(body.contentType).toLowerCase();

    // basic allow-list (you can expand this)
    // NOTE: don’t be too strict unless you want to block uploads.
    if (!contentType || !contentType.includes("/")) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_contentType" }, 400);
    }

    const scope = safePrefix(s(body.scope));
    const prefixOverride = safePrefix(s(body.prefix));
    const finalPrefix = prefixOverride || PREFIX;

    const id = crypto.randomUUID();
    const key = joinKey(finalPrefix, [
      scope || "",
      `${Date.now()}_${id}_${filename}`,
    ]);

    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      // optional: you can set CacheControl if your CDN rules expect it
      // CacheControl: "public, max-age=31536000, immutable",
    });

    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: EXPIRES });

    const publicUrl = buildPublicUrl(PUBLIC_BASE, key);

    return noStoreJson(req, {
      ok: true as const,
      requestId,
      key,
      uploadUrl,
      ...(publicUrl ? { publicUrl } : {}),
      expiresInSeconds: EXPIRES,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return noStoreJson(req, { ok: false as const, requestId, error: message || "upload_presign_failed" }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method not allowed. Use POST." }, 405);
}