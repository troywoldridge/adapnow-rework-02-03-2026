// src/app/api/uploads/put/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/uploads/put
 *
 * Direct upload (multipart/form-data) of PDF artwork into Cloudflare R2 via S3-compatible API.
 *
 * FormData:
 *  - file: File (PDF)
 *  - productId: string|number
 *  - side: string|number (1=front, 2=back, otherwise side-N)
 *
 * Response:
 * {
 *   ok: true,
 *   id: string,          // storage key (use as storageId)
 *   productId: string,
 *   side: number,
 *   type: string,        // "front" | "back" | "side-N"
 *   key: string,
 *   url: string,         // public CDN URL
 *   contentType: "application/pdf",
 *   requestId: string
 * }
 *
 * Env (supports multiple aliases):
 *  - R2_ACCOUNT_ID
 *  - R2_ACCESS_KEY_ID
 *  - R2_SECRET_ACCESS_KEY
 *  - R2_BUCKET_NAME
 *  - R2_PUBLIC_BASEURL (or R2_PUBLIC_BASE_URL)
 *
 * Notes:
 * - No module-level env reads (safer in Next build).
 * - Validates inputs with Zod.
 * - Adds requestId + no-store for API response.
 */

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function noStoreJson(req: NextRequest, body: any, status = 200) {
  const requestId = body?.requestId || getRequestId(req);
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function readEnv(...keys: string[]): string {
  for (const k of keys) {
    const v = (process.env as Record<string, string | undefined>)[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function sanitizeSegment(s: string) {
  return s.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

function sideToType(sideNum: number, total?: number) {
  if (sideNum === 1) return "front";
  if (sideNum === 2 && (total ?? 2) >= 2) return "back";
  return `side-${sideNum}`;
}

function contentTypeIsPdf(ct: string) {
  const s = (ct || "").toLowerCase();
  return s === "application/pdf";
}

function isProbablyPdfFilename(name: string) {
  return /\.pdf$/i.test(name);
}

function requireR2() {
  const accountId = readEnv("R2_ACCOUNT_ID");
  const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
  const bucket = readEnv("R2_BUCKET_NAME");
  const publicBase = readEnv("R2_PUBLIC_BASEURL", "R2_PUBLIC_BASE_URL");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    throw new Error(
      "Missing R2 env vars. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASEURL"
    );
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { s3, bucket, publicBase: publicBase.replace(/\/+$/, "") };
}

const MAX_BYTES = 100 * 1024 * 1024;

const MetaSchema = z
  .object({
    productId: z.string().trim().min(1).max(120),
    side: z.number().int().min(1).max(16),
  })
  .strict();

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const { s3, bucket, publicBase } = requireR2();

    const form = await req.formData();
    const file = form.get("file") as File | null;

    const productIdRaw = form.get("productId");
    const sideRaw = form.get("side");

    const metaParsed = MetaSchema.safeParse({
      productId: String(productIdRaw ?? "").trim(),
      side: Number(sideRaw ?? "1"),
    });

    if (!metaParsed.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_fields",
          issues: metaParsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400
      );
    }

    if (!file) return noStoreJson(req, { ok: false as const, requestId, error: "missing_file" }, 400);

    const productId = metaParsed.data.productId;
    const side = metaParsed.data.side;

    const ct = (file.type || "").toLowerCase();
    const name = typeof (file as any)?.name === "string" ? String((file as any).name) : "artwork.pdf";
    const originalName = sanitizeSegment(name || "artwork.pdf");

    // Some browsers may not set file.type reliably; we accept if filename looks like .pdf.
    if (!contentTypeIsPdf(ct) && !isProbablyPdfFilename(originalName)) {
      return noStoreJson(req, { ok: false as const, requestId, error: "only_pdf_allowed" }, 400);
    }

    const size = Number((file as any)?.size ?? 0);
    if (Number.isFinite(size) && size > MAX_BYTES) {
      return noStoreJson(req, { ok: false as const, requestId, error: "file_too_large" }, 413);
    }

    const ext = ".pdf";
    const baseName = originalName.toLowerCase().endsWith(ext) ? originalName.slice(0, -ext.length) : originalName;
    const uuid = crypto.randomUUID();

    // Key stays stable-ish and readable
    const key = `artwork/${sanitizeSegment(productId)}/${Date.now()}_${uuid}_side-${side}_${sanitizeSegment(baseName)}${ext}`;

    const ab = await file.arrayBuffer();
    const put = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(ab),
      ContentType: "application/pdf",
      CacheControl: "public, max-age=31536000, immutable",
      ContentDisposition: `inline; filename="${originalName.endsWith(ext) ? originalName : `${originalName}${ext}`}"`,
    });

    await s3.send(put);

    // Public URL:
    // Your prior code strips "artwork/" from the public-facing path. Keep that behavior.
    const publicPath = key.replace(/^artwork\//, "");
    const url = `${publicBase}/${publicPath}`;

    return noStoreJson(
      req,
      {
        ok: true as const,
        requestId,
        id: key, // storage key (keep full key as durable id)
        productId,
        side,
        type: sideToType(side),
        key,
        url,
        contentType: "application/pdf",
        sizeBytes: Number.isFinite(size) ? size : undefined,
      },
      200
    );
  } catch (err: any) {
    const msg = String(err?.message || err || "upload_failed");
    console.error("[/api/uploads/put POST] failed:", msg);
    return noStoreJson(req, { ok: false as const, requestId, error: msg }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
