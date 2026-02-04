// src/app/api/uploads/r2/route.ts
import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2PublicBaseUrl } from "@/lib/r2Public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCOUNT = process.env.R2_ACCOUNT_ID || "";
const ACCESS = process.env.R2_ACCESS_KEY_ID || "";
const SECRET = process.env.R2_SECRET_ACCESS_KEY || "";
const BUCKET = process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || "";
const PREFIX = (process.env.R2_UPLOAD_PREFIX || "uploads").replace(/^\/+|\/+$/g, "");
const EXPIRES = Math.max(60, Number(process.env.R2_PRESIGN_EXPIRES_SECONDS || 900));

function json(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

function s3() {
  if (!ACCOUNT || !ACCESS || !SECRET || !BUCKET) {
    const miss = [
      !ACCOUNT && "R2_ACCOUNT_ID",
      !ACCESS && "R2_ACCESS_KEY_ID",
      !SECRET && "R2_SECRET_ACCESS_KEY",
      !BUCKET && "R2_BUCKET|R2_BUCKET_NAME",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Missing env: ${miss}`);
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET },
    forcePathStyle: true,
  });
}

const COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
};

async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

async function readOrCreateSid() {
  const jar = await getJar();
  const existing = jar?.get?.("sid")?.value ?? jar?.get?.("adap_sid")?.value ?? "";
  if (existing) return { sid: existing, created: false };
  return { sid: crypto.randomUUID(), created: true };
}

function setSid(res: NextResponse, sid: string) {
  res.cookies.set("sid", sid, COOKIE_OPTS);
  res.cookies.set("adap_sid", sid, COOKIE_OPTS);
}

function safeName(name: string) {
  return String(name || "file")
    .trim()
    .replace(/[^a-zA-Z0-9.\-_]/g, "_")
    .slice(-180);
}

function norm(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const PUBLIC_BASE = getR2PublicBaseUrl(); // throws if invalid
    const { sid } = await readOrCreateSid();

    const body = (await req.json().catch(() => null)) as any;
    if (!body) {
      const res = json({ ok: false, error: "Invalid JSON body" }, 400);
      setSid(res, sid);
      return res;
    }

    const filename = safeName(body.filename);
    const contentType = norm(body.contentType) || "application/octet-stream";

    const draftId = norm(body.draftId) || ""; // upload-before-cart
    const lineId = norm(body.lineId) || ""; // upload-after-cart (optional)

    if (!filename) {
      const res = json({ ok: false, error: "filename required" }, 400);
      setSid(res, sid);
      return res;
    }

    // Key strategy:
    // - If lineId exists: uploads/artwork/lines/<sid>/<lineId>/...
    // - Else if draftId exists: uploads/artwork/staged/<sid>/<draftId>/...
    // - Else: uploads/artwork/misc/<sid>/...
    const keyParts = [
      PREFIX,
      "artwork",
      lineId ? "lines" : draftId ? "staged" : "misc",
      sid,
      lineId || draftId || "",
      `${Date.now()}-${filename}`,
    ].filter(Boolean);

    const key = keyParts.join("/");

    const put = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3(), put, { expiresIn: EXPIRES });
    const publicUrl = new URL(key.replace(/^\/+/, ""), PUBLIC_BASE + "/").toString();

    const res = json({ ok: true, uploadUrl, key, publicUrl }, 200);
    setSid(res, sid);
    return res;
  } catch (err: any) {
    console.error("[/api/uploads/r2] error:", err?.message || err);
    return json({ ok: false, error: err?.message || "upload presign error" }, 500);
  }
}

// quick health check
export async function GET() {
  try {
    getR2PublicBaseUrl();
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "bad config" }, 500);
  }
}
