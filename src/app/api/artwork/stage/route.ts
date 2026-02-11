import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { artworkStaged } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreHeaders() {
  return { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };
}

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: noStoreHeaders() });
}

// Next 14 (sync) + Next 15 (async)
async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback = 0) {
  const n = Number(String(v ?? ""));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toOptionIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
}

async function getSid(): Promise<string> {
  const jar = await getJar();
  return norm(jar.get?.("sid")?.value ?? jar.get?.("adap_sid")?.value ?? "");
}

export async function POST(req: NextRequest) {
  const sid = await getSid();
  if (!sid) return json(400, { ok: false, error: "no_session" });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const draftId = norm(body.draftId);
  const productId = toInt(body.productId, 0);
  const optionIds = toOptionIds(body.optionIds);
  const side = Math.max(1, toInt(body.side, 1));

  const key = norm(body.key);
  const url = norm(body.url);
  const fileName = norm(body.fileName) || "artwork";
  const contentType = norm(body.contentType) || null;

  if (!draftId) return json(400, { ok: false, error: "draftId_required" });
  if (!productId) return json(400, { ok: false, error: "productId_required" });
  if (!key || !url) return json(400, { ok: false, error: "key_and_url_required" });

  // Upsert on (sid, draft_id, side) so retries replace the staged row.
  const [row] = await db
    .insert(artworkStaged)
    .values({
      sid,
      draftId,
      productId,
      optionIds: optionIds as any, // jsonb array
      side,
      fileName,
      key,
      url,
      contentType,
    })
    .onConflictDoUpdate({
      target: [artworkStaged.sid, artworkStaged.draftId, artworkStaged.side],
      set: {
        productId,
        optionIds: optionIds as any,
        fileName,
        key,
        url,
        contentType,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return json(200, { ok: true, upload: row });
}

export async function GET(req: NextRequest) {
  const sid = await getSid();
  if (!sid) return json(400, { ok: false, error: "no_session" });

  const { searchParams } = new URL(req.url);
  const draftId = norm(searchParams.get("draftId"));
  if (!draftId) return json(400, { ok: false, error: "draftId_required" });

  const uploads = await db
    .select()
    .from(artworkStaged)
    .where(and(eq(artworkStaged.sid, sid), eq(artworkStaged.draftId, draftId)))
    .orderBy(artworkStaged.side);

  return json(200, { ok: true, uploads });
}

export async function DELETE(req: NextRequest) {
  const sid = await getSid();
  if (!sid) return json(400, { ok: false, error: "no_session" });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const draftId = norm(body.draftId);
  const sideRaw = body.side;

  if (!draftId) return json(400, { ok: false, error: "draftId_required" });

  // If side is provided, delete only that side; otherwise delete all for draftId.
  const side = toInt(sideRaw, 0);

  await db
    .delete(artworkStaged)
    .where(
      side > 0
        ? and(eq(artworkStaged.sid, sid), eq(artworkStaged.draftId, draftId), eq(artworkStaged.side, side))
        : and(eq(artworkStaged.sid, sid), eq(artworkStaged.draftId, draftId)),
    );

  return json(200, { ok: true });
}
