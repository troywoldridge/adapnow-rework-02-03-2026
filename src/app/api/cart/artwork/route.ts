// src/app/api/cart/artwork/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, desc, eq, inArray } from "drizzle-orm";

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

// Next 14 (sync) + Next 15 (async)
async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

async function getSid(): Promise<string> {
  const jar = await getJar();
  return jar.get?.("sid")?.value ?? jar.get?.("adap_sid")?.value ?? "";
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

/**
 * GET /api/cart/artwork?lineId=... | ?cartId=...
 * Security: must be the current sid's open cart.
 */
export async function GET(req: NextRequest) {
  try {
    const sid = await getSid();
    if (!sid) return noStore(NextResponse.json({ ok: false, error: "no_session" }, { status: 401 }));

    const cart = await db.query.carts.findFirst({
      where: and(eq(carts.sid, sid), eq(carts.status, "open")),
      columns: { id: true },
    });
    if (!cart) return noStore(NextResponse.json({ ok: true, attachments: [] }, { status: 200 }));

    const { searchParams } = new URL(req.url);
    const lineId = norm(searchParams.get("lineId"));
    const cartIdParam = norm(searchParams.get("cartId"));

    if (!lineId && !cartIdParam) {
      return noStore(NextResponse.json({ ok: false, error: "Provide lineId or cartId" }, { status: 400 }));
    }

    // Never trust cartId from client; use sid’s open cart
    const effectiveCartId = cart.id;

    let rows: any[] = [];

    if (lineId) {
      const line = await db.query.cartLines.findFirst({
        where: and(eq(cartLines.id, lineId), eq(cartLines.cartId, effectiveCartId)),
        columns: { id: true },
      });
      if (!line) return noStore(NextResponse.json({ ok: false, error: "line_not_found" }, { status: 404 }));

      rows = await db
        .select()
        .from(cartAttachments)
        .where(eq(cartAttachments.lineId, lineId))
        .orderBy(desc(cartAttachments.createdAt));
    } else {
      const lineRows = await db
        .select({ id: cartLines.id })
        .from(cartLines)
        .where(eq(cartLines.cartId, effectiveCartId));

      const lineIds = lineRows.map((r) => r.id);
      if (lineIds.length === 0) return noStore(NextResponse.json({ ok: true, attachments: [] }, { status: 200 }));

      rows = await db
        .select()
        .from(cartAttachments)
        .where(inArray(cartAttachments.lineId, lineIds as any))
        .orderBy(desc(cartAttachments.createdAt));
    }

    const attachments = rows.map((r: any) => ({
      id: String(r.id),
      lineId: String(r.lineId),
      storageId: String(r.key),
      url: String(r.url || ensureUrlFromKey(String(r.key))),
      fileName: String(r.fileName || "artwork"),
      createdAt: r.createdAt ?? null,
    }));

    return noStore(NextResponse.json({ ok: true, attachments }, { status: 200 }));
  } catch (err: any) {
    console.error("GET /api/cart/artwork failed:", err);
    return noStore(NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 }));
  }
}

/**
 * POST /api/cart/artwork
 * Accepts:
 * - { lineId, storageId, fileName? } (original)
 * - { lineId, key, url, fileName? } (new/compat)
 */
export async function POST(req: NextRequest) {
  try {
    const sid = await getSid();
    if (!sid) return noStore(NextResponse.json({ ok: false, error: "no_session" }, { status: 401 }));

    const cart = await db.query.carts.findFirst({
      where: and(eq(carts.sid, sid), eq(carts.status, "open")),
      columns: { id: true },
    });
    if (!cart) return noStore(NextResponse.json({ ok: false, error: "open_cart_not_found" }, { status: 404 }));

    const body = (await req.json().catch(() => ({}))) as {
      lineId?: string;
      storageId?: string;
      key?: string;
      url?: string;
      fileName?: string;
    };

    const lineId = norm(body.lineId);
    const key = norm(body.storageId ?? body.key);
    const url = norm(body.url);

    if (!lineId || (!key && !url)) {
      return noStore(
        NextResponse.json({ ok: false, error: "lineId and (storageId/key or url) required" }, { status: 400 }),
      );
    }

    // Ensure line belongs to sid cart
    const line = await db.query.cartLines.findFirst({
      where: and(eq(cartLines.id, lineId), eq(cartLines.cartId, cart.id)),
      columns: { id: true, productId: true },
    });
    if (!line) return noStore(NextResponse.json({ ok: false, error: "line_not_found" }, { status: 404 }));

    const storageId = key || url;
    const finalUrl = url || ensureUrlFromKey(storageId);
    const fileName = safeFileName(body.fileName, storageId);

    const [row] = await db
      .insert(cartAttachments)
      .values({
        lineId,
        productId: Number(line.productId),
        fileName,
        key: storageId,
        url: finalUrl,
        // createdAt/updatedAt handled by defaultNow()
      })
      .onConflictDoNothing({
        target: [cartAttachments.lineId, cartAttachments.key],
      })
      .returning({ id: cartAttachments.id });

    // If it conflicted, returning() can be empty; still report ok.
    const id = row?.id ? String(row.id) : null;

    return noStore(
      NextResponse.json(
        { ok: true, attachment: { id, lineId, storageId, url: finalUrl, fileName } },
        { status: 200 },
      ),
    );
  } catch (err: any) {
    console.error("POST /api/cart/artwork failed:", err);
    return noStore(NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 }));
  }
}
