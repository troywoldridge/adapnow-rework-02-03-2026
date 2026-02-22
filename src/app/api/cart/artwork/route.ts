import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { cartAttachments } from "@/lib/db/schema/cartAttachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function getSidFromRequest(req: NextRequest): string {
  return req.cookies.get("sid")?.value ?? req.cookies.get("adap_sid")?.value ?? "";
}

async function getOpenCartBySid(sid: string) {
  const [cart] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(and(eq(carts.sid, sid), ne(carts.status, "closed")))
    .limit(1);

  return cart ?? null;
}

async function ensureLineBelongsToCart(cartId: string, cartLineId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: cartLines.id })
    .from(cartLines)
    .where(and(eq(cartLines.id, cartLineId), eq(cartLines.cartId, cartId)))
    .limit(1);

  return !!row;
}

type CreateBody = {
  // client-friendly
  lineId?: unknown;

  // db-ish (optional)
  cartLineId?: unknown;

  key?: unknown;
  url?: unknown;

  // allow either spelling from client; DB column is fileName
  filename?: unknown;
  fileName?: unknown;

  contentType?: unknown;
  kind?: unknown;
  meta?: unknown;

  // accepted but NOT stored (your schema doesn't have these)
  sizeBytes?: unknown;
  width?: unknown;
  height?: unknown;
};

function parseCreateBody(v: unknown): CreateBody {
  if (!isRecord(v)) return {};
  return {
    lineId: v["lineId"],
    cartLineId: v["cartLineId"],
    key: v["key"],
    url: v["url"],
    filename: v["filename"],
    fileName: v["fileName"],
    contentType: v["contentType"],
    kind: v["kind"],
    meta: v["meta"],
    sizeBytes: v["sizeBytes"],
    width: v["width"],
    height: v["height"],
  };
}

/**
 * GET:
 *   /api/cart/artwork?lineId=<uuid>
 *   Lists attachments for a given cart line (must belong to the open cart for this sid).
 */
export async function GET(req: NextRequest) {
  try {
    const sid = getSidFromRequest(req);
    if (!sid) return NextResponse.json({ ok: false, error: "No session/cart." }, { status: 400 });

    const cart = await getOpenCartBySid(sid);
    if (!cart) return NextResponse.json({ ok: false, error: "Cart not found." }, { status: 404 });

    const url = new URL(req.url);
    const lineId = url.searchParams.get("lineId") || url.searchParams.get("cartLineId") || "";
    if (!lineId) return NextResponse.json({ ok: false, error: "Missing lineId." }, { status: 400 });

    const owns = await ensureLineBelongsToCart(cart.id, lineId);
    if (!owns) return NextResponse.json({ ok: false, error: "Line not found." }, { status: 404 });

    const rows = await db
      .select()
      .from(cartAttachments)
      .where(eq(cartAttachments.cartLineId, lineId))
      .orderBy(desc(cartAttachments.createdAt));

    return NextResponse.json({ ok: true, lineId, attachments: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

/**
 * POST:
 *   Body supports { lineId, key, url, ... } OR { cartLineId, ... }.
 *   Also accepts filename or fileName; DB column is fileName.
 */
export async function POST(req: NextRequest) {
  try {
    const sid = getSidFromRequest(req);
    if (!sid) return NextResponse.json({ ok: false, error: "No session/cart." }, { status: 400 });

    const cart = await getOpenCartBySid(sid);
    if (!cart) return NextResponse.json({ ok: false, error: "Cart not found." }, { status: 404 });

    const raw: unknown = await req.json().catch(() => ({}));
    const body = parseCreateBody(raw);

    const cartLineId = safeString(body.cartLineId ?? body.lineId);
    const key = safeString(body.key);
    const url = safeString(body.url);

    if (!cartLineId) return NextResponse.json({ ok: false, error: "Missing lineId." }, { status: 400 });
    if (!key) return NextResponse.json({ ok: false, error: "Missing key." }, { status: 400 });
    if (!url) return NextResponse.json({ ok: false, error: "Missing url." }, { status: 400 });

    const owns = await ensureLineBelongsToCart(cart.id, cartLineId);
    if (!owns) return NextResponse.json({ ok: false, error: "Line not found." }, { status: 404 });

    const fileNameStr = safeString(body.fileName ?? body.filename);
    const contentTypeStr = safeString(body.contentType);
    const kindStr = safeString(body.kind);

    // IMPORTANT: Drizzle insert type indicates these are optional (undefined OK), not nullable (null NOT OK).
    const [inserted] = await db
      .insert(cartAttachments)
      .values({
        cartLineId,
        key,
        url,
// sourcery skip: simplify-ternary
        fileName: fileNameStr ? fileNameStr : undefined,
        contentType: contentTypeStr ? contentTypeStr : undefined,
        kind: kindStr ? kindStr : undefined,
        meta: body.meta ?? undefined,
      })
      .returning();

    return NextResponse.json({ ok: true, attachment: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

/**
 * DELETE:
 *   /api/cart/artwork?id=<attachmentId>
 *   Deletes an attachment (must belong to a cart line in the open cart).
 */
export async function DELETE(req: NextRequest) {
  try {
    const sid = getSidFromRequest(req);
    if (!sid) return NextResponse.json({ ok: false, error: "No session/cart." }, { status: 400 });

    const cart = await getOpenCartBySid(sid);
    if (!cart) return NextResponse.json({ ok: false, error: "Cart not found." }, { status: 404 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id") || "";
    if (!id) return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });

    const [att] = await db
      .select({
        id: cartAttachments.id,
        cartLineId: cartAttachments.cartLineId,
      })
      .from(cartAttachments)
      .where(eq(cartAttachments.id, id))
      .limit(1);

    if (!att) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

    const owns = await ensureLineBelongsToCart(cart.id, att.cartLineId);
    if (!owns) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

    await db.delete(cartAttachments).where(eq(cartAttachments.id, id));

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
