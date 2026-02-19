import "server-only";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { artworkStaged } from "@/lib/db/schema/artworkStaged";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function asOptionalString(v: unknown): string | null {
  const s = asString(v).trim();
  return s ? s : null;
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body");
    }

    // NOTE: productId is TEXT in your Drizzle insert type (error shows string expected).
    // Coerce incoming values so inserts always match schema types.
    const draftId = asString((body as any).draftId).trim();
    const productId = asString((body as any).productId).trim();

    const fileName = asString((body as any).fileName).trim();
    const fileUrl = asString((body as any).fileUrl).trim();

    // Optional / best-effort fields (only included if present)
    const fileKey = asOptionalString((body as any).fileKey);
    const contentType = asOptionalString((body as any).contentType);
    const side = asOptionalString((body as any).side);

    // You may have these columns; include them only if your schema supports them.
    // If your schema doesn't have them, remove them from the insert below.
    const bytes = (body as any).bytes;
    const byteSize =
      typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? Math.trunc(bytes) : null;

    const checksumSha256 = asOptionalString((body as any).checksumSha256);

    if (!draftId) return jsonError(400, "Missing draftId");
    if (!productId) return jsonError(400, "Missing productId");
    if (!fileName) return jsonError(400, "Missing fileName");
    if (!fileUrl) return jsonError(400, "Missing fileUrl");

    // IMPORTANT:
    // Your error says: "'sid' does not exist in type ...", so DO NOT insert "sid".
    // Most likely your PK column is "id". We generate a UUID and store it in "id".
    const sid = crypto.randomUUID();

    const values: Record<string, any> = {
      id: sid, // <-- FIX: was "sid", but schema expects a different column (commonly "id")
      draftId,
      productId, // <-- FIX: now coerced to string above
      fileName,
      fileUrl,
    };

    // Only attach optional columns if present (avoids inserting null into non-null cols).
    if (fileKey) values.fileKey = fileKey;
    if (contentType) values.contentType = contentType;
    if (side) values.side = side;
    if (byteSize !== null) values.byteSize = byteSize;
    if (checksumSha256) values.checksumSha256 = checksumSha256;

    const [row] = await db.insert(artworkStaged).values(values as any).returning();

    return NextResponse.json({ ok: true, sid, row });
  } catch (err: any) {
    return jsonError(500, "Failed to stage artwork", {
      message: err?.message ? String(err.message) : "Unknown error",
    });
  }
}
