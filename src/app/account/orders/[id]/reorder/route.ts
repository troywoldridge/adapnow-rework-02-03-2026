// src/app/account/orders/[id]/reorder/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";
import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { cartArtwork } from "@/lib/db/schema/cartArtwork";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrderRow = typeof orders.$inferSelect;
type CartRow = typeof carts.$inferSelect;
type CartInsert = typeof carts.$inferInsert;
type CartLineRow = typeof cartLines.$inferSelect;
type CartLineInsert = typeof cartLines.$inferInsert;
type CartArtworkRow = typeof cartArtwork.$inferSelect;
type CartArtworkInsert = typeof cartArtwork.$inferInsert;

function cleanId(s: unknown): string {
  return String(s ?? "").trim();
}

function redirect(url: string, reqUrl: string, status: 303 | 302 = 303) {
  return NextResponse.redirect(new URL(url, reqUrl), { status });
}

function parseMode(url: string): "append" | "replace" {
  try {
    const u = new URL(url);
    const mode = (u.searchParams.get("mode") || "").toLowerCase().trim();
    return mode === "replace" ? "replace" : "append";
  } catch {
    return "append";
  }
}

async function ensureSid(): Promise<string> {
  const jar = await cookies();
  let sid = jar.get("adap_sid")?.value ?? jar.get("sid")?.value ?? "";

  if (!sid) {
    sid = randomUUID();

    const common = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 90,
    };

    // Prefer adap_sid, but keep sid for legacy readers.
    jar.set("adap_sid", sid, common);
    jar.set("sid", sid, common);
  }

  return sid;
}

async function loadOrderOrNull(orderId: string): Promise<OrderRow | null> {
  const { select } = db;
// sourcery skip: inline-immediately-returned-variable
  const o =
    ((await select().from(orders).where(eq(orders.id, orderId)).limit(1))?.[0] as OrderRow | undefined) ??
    null;
  return o;
}

async function findOrCreateOpenCart(opts: {
  tx: any;
  sid: string;
  currency: "USD" | "CAD";
}): Promise<CartRow | null> {
  const { tx, sid, currency } = opts;

  let cart =
    ((await tx
      .select()
      .from(carts)
      .where(and(eq(carts.sid, sid), ne(carts.status, "closed")))
      .limit(1))?.[0] as CartRow | undefined) ?? undefined;

  if (!cart) {
    const toInsert: CartInsert = {
      sid,
      status: "open" as any,
      currency,
      selectedShipping: null as unknown as CartInsert["selectedShipping"],
    };

    cart = ((await tx.insert(carts).values(toInsert).returning())?.[0] as CartRow | undefined) ?? undefined;
  }

  return cart ?? null;
}

function lineKey(productId: any, quantity: any, optionIds: any) {
  const pid = String(productId ?? "");
  const qty = String(quantity ?? "");
  const arr = Array.isArray(optionIds) ? optionIds.map((x) => String(x)).join(",") : "";
  return `${pid}|${qty}|${arr}`;
}

/**
 * Reorder should be POST (state-changing).
 * GET is still supported for backward compatibility and redirects users somewhere helpful.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const id = cleanId(params?.id);
  if (!id) return redirect("/account?tab=orders", req.url, 302);

  // If someone hits the URL directly, we take them to the order page
  // where the "Reorder" button should POST.
  return redirect(`/account/orders/${encodeURIComponent(id)}`, req.url, 302);
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const orderId = cleanId(params?.id);
  const mode = parseMode(req.url);

  if (!orderId) return redirect("/account?tab=orders", req.url);

  try {
    const { userId } = await auth();
    const sid = await ensureSid();

    const { select, update, transaction } = db;

    const o = await loadOrderOrNull(orderId);
    if (!o) return redirect("/account?tab=orders", req.url);

    // Guest → user claim (only if order currently owned by sid)
    if (userId && String((o as any).userId) === String(sid)) {
      await update(orders).set({ userId }).where(eq(orders.id, orderId));
      (o as any).userId = userId;
    }

    // Ownership check
    const claimants = [userId, sid].filter((v): v is string => Boolean(v));
    if (!claimants.includes(String((o as any).userId))) {
      return redirect("/account?tab=orders", req.url);
    }

    const priorCartId = ((o as any).cartId as string | null) ?? null;
    if (!priorCartId) return redirect("/cart/review", req.url);

    // Load prior lines
    const priorLines = (await select({
      id: cartLines.id,
      productId: cartLines.productId,
      quantity: cartLines.quantity,
      unitPriceCents: cartLines.unitPriceCents,
      lineTotalCents: cartLines.lineTotalCents,
      optionIds: cartLines.optionIds,
      cartId: cartLines.cartId,
    })
      .from(cartLines)
      .where(eq(cartLines.cartId, priorCartId))) as Array<
      Pick<CartLineRow, "id" | "productId" | "quantity" | "unitPriceCents" | "lineTotalCents" | "optionIds" | "cartId">
    >;

    if (!priorLines.length) return redirect("/cart/review", req.url);

    const priorIds = priorLines.map((l) => l.id).filter(Boolean);

    // Load prior artwork
    const priorArt: Array<Pick<CartArtworkRow, "cartLineId" | "url" | "side">> =
      priorIds.length > 0
        ? ((await select({
            cartLineId: cartArtwork.cartLineId,
            url: cartArtwork.url,
            side: cartArtwork.side,
          })
            .from(cartArtwork)
            .where(inArray(cartArtwork.cartLineId, priorIds))) as Array<
            Pick<CartArtworkRow, "cartLineId" | "url" | "side">
          >)
        : [];

    const currency: "USD" | "CAD" = (o as any).currency === "CAD" ? "CAD" : "USD";

    const newCartId = await transaction(async (tx: any) => {
      const cart = await findOrCreateOpenCart({ tx, sid, currency });
      if (!cart) return null;

      // If mode=replace, wipe current cart lines + artwork first.
      if (mode === "replace") {
        const existingLines = (await tx
          .select({ id: cartLines.id })
          .from(cartLines)
          .where(eq(cartLines.cartId, cart.id))) as Array<{ id: string }>;

        const ids = existingLines.map((r) => r.id).filter(Boolean);
        if (ids.length) {
          await tx.delete(cartArtwork).where(inArray(cartArtwork.cartLineId, ids));
        }
        await tx.delete(cartLines).where(eq(cartLines.cartId, cart.id));
      }

      // Build existing key set (for append dedupe)
      const existing = (await tx
        .select({
          productId: cartLines.productId,
          quantity: cartLines.quantity,
          optionIds: cartLines.optionIds,
        })
        .from(cartLines)
        .where(eq(cartLines.cartId, cart.id))) as Array<{
        productId: any;
        quantity: any;
        optionIds: any;
      }>;

      const existingKeys = new Set(existing.map((r) => lineKey(r.productId, r.quantity, r.optionIds)));

      for (const l of priorLines) {
        const k = lineKey(l.productId, l.quantity, l.optionIds);

        // In append mode, skip duplicates. In replace mode, the cart is empty anyway.
        if (mode === "append" && existingKeys.has(k)) continue;

        const newLine: CartLineInsert = {
          cartId: cart.id,
          productId: l.productId,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          lineTotalCents: l.lineTotalCents,
          optionIds: l.optionIds,
        };

        const nl = (await tx.insert(cartLines).values(newLine).returning())?.[0] as CartLineRow | undefined;
        if (!nl) continue;

        const artForLine = priorArt.filter((a) => a.cartLineId === l.id);
        if (artForLine.length) {
          const artInserts: CartArtworkInsert[] = artForLine.map((a) => ({
            cartLineId: nl.id,
            key: String(a.url || randomUUID()),
            url: a.url,
            side: Number(a.side ?? 1) || 1,
          }));
          await tx.insert(cartArtwork).values(artInserts);
        }

        existingKeys.add(k);
      }

      return cart.id;
    });

    if (!newCartId) return redirect("/cart/review", req.url);

    return redirect("/cart/review", req.url, 303);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("reorder failed:", msg);
    return redirect("/account?tab=orders", req.url);
  }
}
