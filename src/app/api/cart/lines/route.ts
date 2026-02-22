import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { jsonError, getRequestId } from "@/lib/apiError";
import { withRequestId } from "@/lib/logger";
import { carts, cartLines, cartAttachments } from "@/lib/db/schema";
import { computePrice } from "@/lib/price/compute";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

const COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
};

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return res;
}

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function sameArray(a: number[] = [], b: number[] = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function toOptionIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
}

function setSidCookies(res: NextResponse, sid: string) {
  res.cookies.set("adap_sid", sid, COOKIE_OPTS);
  res.cookies.set("sid", sid, COOKIE_OPTS);
}

/** Always returns a real string (never undefined). */
function cookieString(req: NextRequest, name: string): string {
  const c = req.cookies.get(name);
  const v = c && typeof (c as any).value === "string" ? String((c as any).value) : "";
  return v.trim();
}

type AttachmentInput = {
  key?: unknown;
  storageId?: unknown;
  url?: unknown;
  fileName?: unknown;
};

function toAttachmentInputs(v: unknown): Array<{ key: string; url: string; fileName?: string }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ key: string; url: string; fileName?: string }> = [];

  for (const item of v) {
    const it = item as AttachmentInput;
    const key = norm(it.storageId ?? it.key);
    const url = norm(it.url);
    const fileName = norm(it.fileName);
    if (!key || !url) continue;
    out.push({ key, url, fileName: fileName || undefined });
  }

  return out;
}

/**
 * POST /api/cart/lines
 */
export async function POST(req: NextRequest) {
  // ✅ Force requestId to ALWAYS be a string (fixes TS2345 at withRequestId)
  const requestId: string =
    (getRequestId(req) as string | undefined) ??
    req.headers.get("x-request-id") ??
    crypto.randomUUID();

  const log = withRequestId(requestId);
  const db = getDb();

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const productId = Number(body?.productId);
    const quantity = Math.max(1, Number(body?.quantity ?? body?.qty ?? 1) || 1);
    const store: "US" | "CA" = body?.store === "CA" ? "CA" : "US";
    const optionIds = toOptionIds(body?.optionIds);
    const attachmentsIn = toAttachmentInputs(body?.attachments);

    if (!Number.isFinite(productId) || productId <= 0) {
      return noStore(jsonError(400, "Invalid productId", { code: "invalid_productId", requestId }));
    }

    if (optionIds.length === 0) {
      return noStore(jsonError(400, "optionIds required", { code: "missing_optionIds", requestId }));
    }

    // ✅ server-authoritative pricing
    const priced = await computePrice({ productId, store, quantity, optionIds });

    // ✅ cookie values are guaranteed strings
    const cookieA: string = cookieString(req, "adap_sid");
    const cookieB: string = cookieString(req, "sid");

    // Prefer existing open cart for cookieA/cookieB
    let openCartSid: string = "";

    if (cookieA) {
      const found = await db.query.carts.findFirst({
        where: and(eq(carts.sid, cookieA), eq(carts.status, "open")),
        columns: { id: true },
      });
      if (found) openCartSid = cookieA;
    }

    if (!openCartSid && cookieB && cookieB !== cookieA) {
      const found = await db.query.carts.findFirst({
        where: and(eq(carts.sid, cookieB), eq(carts.status, "open")),
        columns: { id: true },
      });
      if (found) openCartSid = cookieB;
    }

    // ✅ Build sid with explicit steps => sid is ALWAYS type string
    let sid: string = "";
    if (openCartSid) sid = openCartSid;
    if (!sid && cookieA) sid = cookieA;
    if (!sid && cookieB) sid = cookieB;
    if (!sid) sid = crypto.randomUUID();

    // Find or create cart
    let cart = await db.query.carts.findFirst({
      where: and(eq(carts.sid, sid), eq(carts.status, "open")),
    });

    if (!cart) {
      const [created] = await db
        .insert(carts)
        .values({ sid, status: "open", currency: priced.currency })
        .returning();
      cart = created;
    } else if (!cart.currency) {
      await db.update(carts).set({ currency: priced.currency }).where(eq(carts.id, cart.id));
    }

    // Merge behavior (same productId + optionIds → bump quantity)
    const existing = await db
      .select()
      .from(cartLines)
      .where(and(eq(cartLines.cartId, cart.id), eq(cartLines.productId, productId)));

    const match = existing.find((l) => sameArray((l as any).optionIds ?? [], optionIds));

    let line: typeof cartLines.$inferSelect;
    let merged = false;

    if (match) {
      merged = true;

      const prevQty = Number((match as any).quantity ?? 0);
      const newQty = Math.max(1, prevQty + quantity);

      const [updated] = await db
        .update(cartLines)
        .set({
          quantity: newQty,
          currency: priced.currency,
          unitPriceCents: priced.unitSellCents,
          lineTotalCents: priced.unitSellCents * newQty,
          updatedAt: new Date(),
        })
        .where(eq(cartLines.id, (match as any).id))
        .returning();

      line = updated;
    } else {
      const [inserted] = await db
        .insert(cartLines)
        .values({
          cartId: cart.id,
          productId,
          quantity,
          optionIds: optionIds as any,
          currency: priced.currency,
          unitPriceCents: priced.unitSellCents,
          lineTotalCents: priced.unitSellCents * quantity,
          artwork: {},
        })
        .returning();

      line = inserted;
    }

    // ✅ Attach provided attachments (schema uses cartLineId)
    if (attachmentsIn.length > 0) {
      const cartLineId = String((line as any).id);

      for (const att of attachmentsIn) {
        await db
          .insert(cartAttachments)
          .values({
            cartLineId,
            key: att.key,
            url: att.url,
            fileName: att.fileName || undefined,
          })
          .onConflictDoNothing({
            target: [cartAttachments.cartLineId, cartAttachments.key],
          });
      }
    }

    const res = NextResponse.json(
      {
        ok: true,
        merged,
        cartId: String((cart as any).id),
        lineId: String((line as any).id),
        line,
      },
      { status: 200 }
    );

    setSidCookies(res, sid);
    return noStore(res);
  } catch (e) {
    log.error("/api/cart/lines POST error", {
      message: e instanceof Error ? e.message : String(e),
    });
    return noStore(jsonError(500, "Failed to add cart line", { requestId }));
  }
}
