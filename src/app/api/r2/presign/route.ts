import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function readFirst(keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing ${name}`);
  return v.trim();
}

function clampInt(n: number, min: number, max: number): number {
  const x = Number.isFinite(n) ? Math.trunc(n) : min;
  return Math.min(max, Math.max(min, x));
}

function safeFilename(name: unknown): string {
  const s = typeof name === "string" ? name : "";
  // keep extensions; avoid path separators and weird unicode control chars
  const cleaned = s.replace(/[^\w.\-()+ ]+/g, "_").replace(/_+/g, "_").trim();
  return cleaned || "upload.bin";
}

function safeContentType(ct: unknown): string | null {
  if (typeof ct !== "string") return null;
  const s = ct.trim().toLowerCase();
  // very permissive but blocks obvious junk
  if (!s || s.length > 100 || !s.includes("/")) return null;
  return s;
}

function normalizePrefix(p: string): string {
  return p.replace(/^\/+|\/+$/g, "");
}

function normalizeBaseUrl(u: string): string {
  return u.replace(/\/+$/, "");
}

type Body = {
  filename?: string;
  contentType?: string;

  // Optional metadata your UI might send (not trusted; just echoed back)
  lineId?: string | null;
  side?: string | null;
};

const ACCOUNT_ID = readFirst(["R2_ACCOUNT_ID"]);
const ACCESS_KEY_ID = readFirst(["R2_ACCESS_KEY_ID"]);
const SECRET_ACCESS_KEY = readFirst(["R2_SECRET_ACCESS_KEY"]);
const BUCKET = readFirst(["R2_BUCKET_NAME", "R2_BUCKET"]);
const PUBLIC_BASE = normalizeBaseUrl(readFirst(["R2_PUBLIC_BASE_URL"]));
const PREFIX = normalizePrefix(readFirst(["R2_UPLOAD_PREFIX"]) || "uploads");
const EXPIRES = clampInt(Number(readFirst(["R2_PRESIGN_EXPIRES_SECONDS"]) || 900), 60, 3600); // 1m..1h

// Lazily create client so missing env doesn't crash import-time.
// (Keeps route boot safer across environments.)
function getS3(): S3Client {
  const accountId = ACCOUNT_ID || requiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = ACCESS_KEY_ID || requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = SECRET_ACCESS_KEY || requiredEnv("R2_SECRET_ACCESS_KEY");

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * POST /api/r2/presign
 * Returns an S3 presigned URL for a PUT upload to R2.
 *
 * Body:
 *  { filename: "artwork.pdf", contentType: "application/pdf" }
 *
 * Response:
 *  { ok: true, uploadUrl, publicUrl, key, expiresInSeconds }
 */
export async function POST(req: Request) {
  try {
    let body: Body | null = null;
    try {
      body = (await req.json()) as Body;
    } catch {
      body = null;
    }

    const filename = safeFilename(body?.filename);
    const contentType = safeContentType(body?.contentType);
    if (!contentType) return jsonError(400, "invalid_contentType");
    if (!BUCKET) return jsonError(500, "missing_bucket_env");

    const key = `${PREFIX}/${Date.now()}-${crypto.randomUUID()}-${filename}`;

    // Include ContentType so the signature expects the same header.
    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      // Add CacheControl / Metadata only if you will also set them on the client PUT.
      // CacheControl: "private, max-age=31536000, immutable",
    });

    const uploadUrl = await getSignedUrl(getS3(), cmd, { expiresIn: EXPIRES });

    const publicUrl = PUBLIC_BASE ? `${PUBLIC_BASE}/${key}` : null;

    return NextResponse.json(
      {
        ok: true,
        key,
        uploadUrl,
        publicUrl,
        expiresInSeconds: EXPIRES,
        // echo-only (not trusted, but useful for UI bookkeeping)
        meta: {
          lineId: typeof body?.lineId === "string" ? body!.lineId : null,
          side: typeof body?.side === "string" ? body!.side : null,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e: any) {
    console.error("POST /api/r2/presign failed", e);
    return jsonError(500, "presign_failed", { detail: String(e?.message || e) });
  }
}

// Guard other methods
export async function GET() {
  return jsonError(405, "method_not_allowed");
}
export const PUT = GET;
export const DELETE = GET;
