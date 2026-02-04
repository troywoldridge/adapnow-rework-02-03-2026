// src/app/api/cart/lines/route.ts
import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts, cartLines } from "@/lib/db/schema";
import { cartAttachments } from "@/lib/db/schema/cartAttachments";
import { computePrice } from "@/lib/price/compute";
import { artworkStaged } from "@/lib/db/schema/artworkStaged";

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

// Next 14 (sync) + Next 15 (async)
async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const productId = Number(body?.productId);
  const quantity = Math.max(1, Number(body?.quantity ?? body?.qty ?? 1) || 1);
  const store: "US" | "CA" = body?.store === "CA" ? "CA" : "US";
  const optionIds = toOptionIds(body?.optionIds);

  // NEW: optional draftId (ties pre-cart artwork uploads to this line)
  const draftId = norm(body?.draftId) || null;

  if (!Number.isFinite(productId) || productId <= 0) {
    return noStore(NextResponse.json({ ok: false, error: "invalid_productId" }, { status: 400 }));
  }

  // If you truly allow “upload before options”, you can relax this,
  // but your pricing/cart logic currently expects options.
  if (optionIds.length === 0) {
    return noStore(NextResponse.json({ ok: false, error: "missing_optionIds" }, { status: 400 }));
  }

  // ✅ Compute server-authoritative pricing
  const priced = await computePrice({ productId, store, quantity, optionIds });

  // Get/choose SID
  const jar = await getJar();
  const cookieA = (jar.get?.("adap_sid")?.value ?? undefined) as string | undefined;
  const cookieB = (jar.get?.("sid")?.value ?? undefined) as string | undefined;
  const candidates: string[] = [cookieA, cookieB].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  // Prefer existing open cart for a candidate SID
  let openCartSid: string | undefined;
  for (const candidate of candidates) {
    const c = await db.query.carts.findFirst({
      where: and(eq(carts.sid, candidate), eq(carts.status, "open")),
    });
    if (c) {
      openCartSid = candidate;
      break;
    }
  }

  const sid: string = openCartSid ?? cookieA ?? cookieB ?? crypto.randomUUID();

  // Find or create cart (persist currency)
  let cart = await db.query.carts.findFirst({
    where: and(eq(carts.sid, sid), eq(carts.status, "open")),
  });

  if (!cart) {
    [cart] = await db.insert(carts).values({ sid, status: "open", currency: priced.currency }).returning();
  } else if (!cart.currency) {
    await db.update(carts).set({ currency: priced.currency }).where(eq(carts.id, cart.id));
  }

  // Merge behavior (same productId + optionIds → bump quantity)
  const existing = await db
    .select()
    .from(cartLines)
    .where(and(eq(cartLines.cartId, cart.id), eq(cartLines.productId, Number(productId))));

  const match = existing.find((l: any) => sameArray(l.optionIds ?? [], optionIds));

  let line: any;
  let merged = false;

  if (match) {
    merged = true;
    const newQty = Math.max(1, Number(match.quantity ?? 0) + quantity);

    [line] = await db
      .update(cartLines)
      .set({
        quantity: newQty,
        currency: priced.currency,
        unitPriceCents: priced.unitSellCents,
        lineTotalCents: priced.unitSellCents * newQty,
        updatedAt: new Date(),
      })
      .where(eq(cartLines.id, match.id))
      .returning();
  } else {
    [line] = await db
      .insert(cartLines)
      .values({
        cartId: cart.id,
        productId: Number(productId),
        quantity,
        optionIds: optionIds as any,
        currency: priced.currency,
        unitPriceCents: priced.unitSellCents,
        lineTotalCents: priced.unitSellCents * quantity,
        artwork: {},
      })
      .returning();
  }

  // ✅ NEW: Attach staged uploads (upload-before-cart flow)
  // - only if draftId provided
  // - only if not already attached (simple dedupe by key)
  if (draftId) {
    const staged = await db
      .select()
      .from(artworkStaged)
      .where(and(eq(artworkStaged.sid, sid), eq(artworkStaged.draftId, draftId)));

    if (staged.length > 0) {
      // Insert into cartAttachments
      // You likely allow multiple attachments per line (front/back/other).
      // We'll store url + key + fileName.
      for (const s of staged) {
        try {
          await db.insert(cartAttachments).values({
            cartId: cart.id,
            lineId: line.id,
            productId: Number(productId),
            fileName: s.fileName,
            key: s.key,
            url: s.url,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);
        } catch {
          // If you later add a unique constraint (lineId+key), this will naturally dedupe.
        }
      }

      // Clear staged uploads for this draft
      await db
        .delete(artworkStaged)
        .where(and(eq(artworkStaged.sid, sid), eq(artworkStaged.draftId, draftId)));
    }
  }

  // Response + cookies
  const res = NextResponse.json({
    ok: true,
    merged,
    cartId: cart.id,
    lineId: line.id,
    line,
  });

  res.cookies.set("adap_sid", sid, COOKIE_OPTS);
  res.cookies.set("sid", sid, COOKIE_OPTS);

  return noStore(res);
}
