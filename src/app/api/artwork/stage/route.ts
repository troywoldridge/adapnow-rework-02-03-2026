// src/app/api/artwork/stage/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { artworkStaged } from "@/lib/db/schema/artworkStaged";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return res;
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

export async function POST(req: NextRequest) {
  const jar = await getJar();
  const sid = jar.get?.("sid")?.value ?? jar.get?.("adap_sid")?.value ?? "";

  if (!sid) {
    return noStore(NextResponse.json({ ok: false, error: "no_session" }, { status: 400 }));
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const draftId = norm(body.draftId);
  const productId = toInt(body.productId, 0);
  const optionIds = toOptionIds(body.optionIds);
  const side = Math.max(1, toInt(body.side, 1));
  const key = norm(body.key);
  const url = norm(body.url);
  const fileName = norm(body.fileName) || "artwork";
  const contentType = norm(body.contentType) || null;

  if (!draftId) {
    return noStore(NextResponse.json({ ok: false, error: "draftId_required" }, { status: 400 }));
  }
  if (!productId) {
    return noStore(NextResponse.json({ ok: false, error: "productId_required" }, { status: 400 }));
  }
  if (!key || !url) {
    return noStore(NextResponse.json({ ok: false, error: "key_and_url_required" }, { status: 400 }));
  }

  // Insert staged row
  await db.insert(artworkStaged).values({
    sid,
    draftId,
    productId,
    optionIds: optionIds as any,
    side,
    fileName,
    key,
    url,
    contentType,
  } as any);

  return noStore(NextResponse.json({ ok: true }, { status: 200 }));
}

export async function GET(req: NextRequest) {
  const jar = await getJar();
  const sid = jar.get?.("sid")?.value ?? jar.get?.("adap_sid")?.value ?? "";
  if (!sid) return noStore(NextResponse.json({ ok: false, error: "no_session" }, { status: 400 }));

  const { searchParams } = new URL(req.url);
  const draftId = norm(searchParams.get("draftId"));
  if (!draftId) return noStore(NextResponse.json({ ok: false, error: "draftId_required" }, { status: 400 }));

  const rows = await db
    .select()
    .from(artworkStaged)
    .where(and(eq(artworkStaged.sid, sid), eq(artworkStaged.draftId, draftId)));

  return noStore(NextResponse.json({ ok: true, uploads: rows }, { status: 200 }));
}

export async function DELETE(req: NextRequest) {
  const jar = await getJar();
  const sid = jar.get?.("sid")?.value ?? jar.get?.("adap_sid")?.value ?? "";
  if (!sid) return noStore(NextResponse.json({ ok: false, error: "no_session" }, { status: 400 }));

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const draftId = norm(body.draftId);
  if (!draftId) return noStore(NextResponse.json({ ok: false, error: "draftId_required" }, { status: 400 }));

  await db.delete(artworkStaged).where(and(eq(artworkStaged.sid, sid), eq(artworkStaged.draftId, draftId)));

  return noStore(NextResponse.json({ ok: true }, { status: 200 }));
}
