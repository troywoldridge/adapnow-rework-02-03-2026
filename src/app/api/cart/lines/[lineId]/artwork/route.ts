import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts, cartLines, cartAttachments } from "@/lib/db/schema";
import { cfUrl } from "@/lib/cf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function getSidFromRequest(req: NextRequest): string {
  return req.cookies.get("sid")?.value ?? req.cookies.get("adap_sid")?.value ?? "";
}

function norm(v: unknown) {
  return String(v ?? "").trim();
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

async function requireOwnedLine(req: NextRequest, lineId: string) {
  const sid = getSidFromRequest(req);
  if (!sid) return { ok: false as const, status: 401, error: "no_session" };

  const cart = await db.query.carts.findFirst({
    where: and(eq(carts.sid, sid), eq(carts.status, "open")),
    columns: { id: true, sid: true, status: true },
  });
  if (!cart) return { ok: false as const, status: 404, error: "open_cart_not_found" };

  const line = await db.query.cartLines.findFirst({
    where: and(eq(cartLines.id, lineId), eq(cartLines.cartId, cart.id)),
    columns: { id: true, cartId: true, productId: true },
  });
  if (!line) return { ok: false as const, status: 404, error: "line_not_found" };

  return { ok: true as const, cart, line };
}

/**
 * GET /api/cart/lines/[lineId]/artwork
 * Returns { ok, attachments: [{ id, storageId, url, fileName, createdAt? }] }
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ lineId: string }> }) {
  try {
    const { lineId } = await ctx.params;
    const lid = norm(lineId);
    if (!lid) return noStore(NextResponse.json({ ok: false, error: "missing_lineId" }, { status: 400 }));

    const owned = await requireOwnedLine(req, lid);
    if (!owned.ok) return noStore(NextResponse.json({ ok: false, error: owned.error }, { status: owned.status }));

    const rows = await db
      .select()
      .from(cartAttachments)
      .where(eq(cartAttachments.cartLineId, lid)) // ✅ cartLineId
      .orderBy(desc((cartAttachments as any).createdAt));

    const attachments = (rows || []).map((r: any) => ({
      id: String(r.id),
      storageId: String(r.key),
      url: String(r.url || ensureUrlFromKey(String(r.key))),
      fileName: String(r.fileName || "artwork"),
      createdAt: r.createdAt ?? null,
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
 * - New:    { key, fileName?, url? }
 * - Legacy: { side, url, key? }   (side ignored server-side)
 *
 * We store: cartLineId, key (storageId), url, fileName
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ lineId: string }> }) {
  try {
    const { lineId } = await ctx.params;
    const lid = norm(lineId);
    if (!lid) return noStore(NextResponse.json({ ok: false, error: "missing_lineId" }, { status: 400 }));

    const owned = await requireOwnedLine(req, lid);
    if (!owned.ok) return noStore(NextResponse.json({ ok: false, error: owned.error }, { status: owned.status }));

    const body = (await req.json().catch(() => ({}))) as {
      key?: string;
      storageId?: string;
      fileName?: string;
      url?: string;
      side?: number | string; // ignored
    };

    const key = norm(body.storageId ?? body.key);
    const url = norm(body.url);

    if (!key && !url) {
      return noStore(NextResponse.json({ ok: false, error: "key_or_url_required" }, { status: 400 }));
    }

    // Prefer key; if missing, last resort use url as key (works but not ideal)
    const storageId = key || url;
    const finalUrl = url || ensureUrlFromKey(storageId);
    const fileName = safeFileName(body.fileName, storageId);

    const [row] = await db
      .insert(cartAttachments)
      .values({
        cartLineId: owned.line.id, // ✅ correct column
// sourcery skip: simplify-ternary
        fileName: fileName ? fileName : undefined, // optional (undefined ok, null not ok)
        key: storageId,
        url: finalUrl,
      })
      .onConflictDoNothing({
        target: [cartAttachments.cartLineId, cartAttachments.key], // ✅ correct conflict target
      })
      .returning({ id: cartAttachments.id });

    const id = row?.id ? String(row.id) : null;

    return noStore(
      NextResponse.json(
        { ok: true, attachment: { id, storageId, url: finalUrl, fileName } },
        { status: 200 }
      )
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
 * Deletes the most recent attachment matching key (preferred), else url.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ lineId: string }> }) {
  try {
    const { lineId } = await ctx.params;
    const lid = norm(lineId);
    if (!lid) return noStore(NextResponse.json({ ok: false, error: "missing_lineId" }, { status: 400 }));

    const owned = await requireOwnedLine(req, lid);
    if (!owned.ok) return noStore(NextResponse.json({ ok: false, error: owned.error }, { status: owned.status }));

    const body = (await req.json().catch(() => ({}))) as {
      key?: string;
      storageId?: string;
      url?: string;
      side?: number | string; // ignored
    };

    const key = norm(body.storageId ?? body.key);
    const url = norm(body.url);

    if (!key && !url) {
      return noStore(NextResponse.json({ ok: false, error: "key_or_url_required" }, { status: 400 }));
    }

    const candidates = await db
      .select({
        id: cartAttachments.id,
        key: cartAttachments.key,
        url: cartAttachments.url,
      })
      .from(cartAttachments)
      .where(eq(cartAttachments.cartLineId, lid)) // ✅ cartLineId
      .orderBy(desc((cartAttachments as any).createdAt));

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
