// src/app/api/cart/lines/[lineId]/artwork/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { cartAttachments } from "@/lib/db/schema/cartAttachments";
import { cfUrl } from "@/lib/cdn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// Next 14 (sync) + Next 15 (async)
async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

async function getSid(): Promise<string> {
  const jar = await getJar();
  return jar.get?.("sid")?.value ?? jar.get?.("adap_sid")?.value ?? "";
}

function safeFileName(input?: string | null, fallbackKey?: string): string {
  const s = (input ?? "").trim();
  if (s) return s;
  const base = (fallbackKey ?? "").split("/").pop() ?? "";
  return base || "artwork";
}

function ensureUrlFromKey(key: string): string {
  return cfUrl(key) ?? key;
}

function norm(v: unknown) {
  return String(v ?? "").trim();
}

async function requireOwnedLine(lineId: string) {
  const sid = await getSid();
  if (!sid) return { ok: false as const, status: 401, error: "no_session" };

  const cart = await db.query.carts.findFirst({
    where: and(eq(carts.sid, sid), eq(carts.status, "open")),
  });
  if (!cart) return { ok: false as const, status: 404, error: "open_cart_not_found" };

  const line = await db.query.cartLines.findFirst({
    where: and(eq(cartLines.id, lineId), eq(cartLines.cartId, cart.id)),
  });
  if (!line) return { ok: false as const, status: 404, error: "line_not_found" };

  return { ok: true as const, cart, line };
}

/**
 * GET /api/cart/lines/[lineId]/artwork
 * Returns { ok, attachments: [{ id, storageId, url, fileName }] }
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ lineId: string }> }) {
  try {
    const { lineId } = await ctx.params;
    const lid = norm(lineId);
    if (!lid) return noStore(NextResponse.json({ ok: false, error: "missing_lineId" }, { status: 400 }));

    const owned = await requireOwnedLine(lid);
    if (!owned.ok) return noStore(NextResponse.json({ ok: false, error: owned.error }, { status: owned.status }));

    const rows = await db
      .select()
      .from(cartAttachments)
      .where(eq(cartAttachments.lineId, lid))
      .orderBy(desc(cartAttachments.createdAt));

    const attachments = (rows || []).map((r: any) => ({
      id: String(r.id),
      storageId: String(r.key),
      url: String(r.url || ensureUrlFromKey(String(r.key))),
      fileName: String(r.fileName || "artwork"),
    }));

    return noStore(NextResponse.json({ ok: true, attachments }, { status: 200 }));
  } catch (err: any) {
    console.error("GET /api/cart/lines/[lineId]/artwork failed:", err);
    return noStore(NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 }));
  }
}

/**
 * POST /api/cart/lines/[lineId]/artwork
 *
 * Supports BOTH payload styles:
 * - New: { key, fileName?, url? }
 * - Legacy (your current clients): { side, url, key? }
 *
 * We store: key (storageId), url, fileName
 * Side is not persisted (no column) — it’s used only client-side.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ lineId: string }> }) {
  try {
    const { lineId } = await ctx.params;
    const lid = norm(lineId);
    if (!lid) return noStore(NextResponse.json({ ok: false, error: "missing_lineId" }, { status: 400 }));

    const owned = await requireOwnedLine(lid);
    if (!owned.ok) return noStore(NextResponse.json({ ok: false, error: owned.error }, { status: owned.status }));

    const body = (await req.json().catch(() => ({}))) as {
      key?: string;
      storageId?: string;
      fileName?: string;
      url?: string;
      side?: number | string;
    };

    const key = norm(body.storageId ?? body.key);
    const url = norm(body.url);
    if (!key && !url) {
      return noStore(
        NextResponse.json({ ok: false, error: "key_or_url_required" }, { status: 400 }),
      );
    }

    // Prefer key; if missing, last resort use url as key (works but not ideal)
    const storageId = key || url;
    const finalUrl = url || ensureUrlFromKey(storageId);
    const fileName = safeFileName(body.fileName, storageId);

    const now = new Date();

    const values: typeof cartAttachments.$inferInsert = {
      cartId: owned.cart.id,
      lineId: lid,
      productId: owned.line.productId,
      fileName,
      key: storageId,
      url: finalUrl,
      createdAt: now,
      updatedAt: now,
    };

    const [row] = await db
      .insert(cartAttachments)
      .values(values)
      .returning({ id: cartAttachments.id });

    return noStore(
      NextResponse.json(
        { ok: true, attachment: { id: String(row.id), storageId, url: finalUrl, fileName } },
        { status: 200 },
      ),
    );
  } catch (err: any) {
    console.error("POST /api/cart/lines/[lineId]/artwork failed:", err);
    return noStore(NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 }));
  }
}

/**
 * DELETE /api/cart/lines/[lineId]/artwork
 * body: { key?: string, storageId?: string, url?: string }
 *
 * We delete the most recent attachment matching key (preferred), else url.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ lineId: string }> }) {
  try {
    const { lineId } = await ctx.params;
    const lid = norm(lineId);
    if (!lid) return noStore(NextResponse.json({ ok: false, error: "missing_lineId" }, { status: 400 }));

    const owned = await requireOwnedLine(lid);
    if (!owned.ok) return noStore(NextResponse.json({ ok: false, error: owned.error }, { status: owned.status }));

    const body = (await req.json().catch(() => ({}))) as {
      key?: string;
      storageId?: string;
      url?: string;
      side?: number | string; // ignored server-side
    };

    const key = norm(body.storageId ?? body.key);
    const url = norm(body.url);

    if (!key && !url) {
      return noStore(NextResponse.json({ ok: false, error: "key_or_url_required" }, { status: 400 }));
    }

    // Find most recent matching attachment on this line
    const candidates = await db
      .select({
        id: cartAttachments.id,
        key: cartAttachments.key,
        url: cartAttachments.url,
      })
      .from(cartAttachments)
      .where(eq(cartAttachments.lineId, lid))
      .orderBy(desc(cartAttachments.createdAt));

    const match = candidates.find((a: any) => {
      if (key && String(a.key) === key) return true;
      if (!key && url && String(a.url) === url) return true;
      return false;
    });

    if (!match) {
      return noStore(NextResponse.json({ ok: true, removed: false }, { status: 200 }));
    }

    const [deleted] = await db
      .delete(cartAttachments)
      .where(eq(cartAttachments.id, match.id))
      .returning({ id: cartAttachments.id });

    return noStore(NextResponse.json({ ok: true, removed: true, id: String(deleted?.id ?? "") }, { status: 200 }));
  } catch (err: any) {
    console.error("DELETE /api/cart/lines/[lineId]/artwork failed:", err);
    return noStore(NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 }));
  }
}
