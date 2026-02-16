import "server-only";

export const runtime = "nodejs";

import { NextResponse } from "next/server";

function readFirst(keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function exists(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function toInt(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

export async function GET() {
  const bucketName = readFirst(["R2_BUCKET_NAME", "R2_BUCKET"]);
  const prefix = readFirst(["R2_UPLOAD_PREFIX"]) || "uploads";
  const expiresSeconds = toInt(readFirst(["R2_PRESIGN_EXPIRES_SECONDS"]) || "900", 900);

  const ok = Boolean(
    bucketName &&
      exists("R2_ACCOUNT_ID") &&
      exists("R2_ACCESS_KEY_ID") &&
      exists("R2_SECRET_ACCESS_KEY") &&
      exists("R2_PUBLIC_BASE_URL")
  );

  return NextResponse.json(
    {
      ok,
      env: {
        R2_ACCOUNT_ID: exists("R2_ACCOUNT_ID"),
        R2_ACCESS_KEY_ID: exists("R2_ACCESS_KEY_ID"),
        R2_SECRET_ACCESS_KEY: exists("R2_SECRET_ACCESS_KEY"),
        R2_BUCKET_NAME: Boolean(bucketName),
        R2_PUBLIC_BASE_URL: exists("R2_PUBLIC_BASE_URL"),
        R2_UPLOAD_PREFIX: prefix,
        R2_PRESIGN_EXPIRES_SECONDS: expiresSeconds,
      },
      runtime: "nodejs",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

// Guard other methods
export async function POST() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
export const PUT = POST;
export const DELETE = POST;
