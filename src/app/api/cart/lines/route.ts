// src/app/api/cart/lines/route.ts
import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { jsonError, getRequestId } from "@/lib/apiError";
import { withRequestId } from "@/lib/logger";
import { carts, cartLines, cartAttachments, artworkStaged } from "@/lib/db/schema";
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

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const log = withRequestId(requestId);
  const db = getDb();

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const productId = Number(body?.productId);
  const quantity = Math.max(1, Number(body?.quantity ?? body?.qty ?? 1) || 1);
  const store: "US" | "CA" = body?.store === "CA" ? "CA" : "US";
  const optionIds = toOptionIds(body?.optionIds);

  // Optional draftId (ties pre-cart artwork uploads to this line)
  const draftId = norm(body?.draftId) || undefined;

  if (!Number.isFinite(productId) || productId <= 0) {
    return noStore(jsonError(400, "Invalid productId", { code: "invalid_productId", requestId }));
  }

  // Pricing/cart logic expects options
  if (optionIds.length === 0) {
    return noStore(jsonError(400, "optionIds required", { code: "missing_optionIds", requestId }));
  }

  // ✅ Compute server-authoritative pricing
  const priced = await computePrice({ productId, store, quantity, optionIds });

  // Get/choose SID
  const jar = await getJar();
  const cookieA = (jar.get?.("adap_sid")?.value ?? undefined) as string | undefined;
  const cookieB = (jar.get?.("sid")?.value ?? undefined) as string | undefined;

  const candidates: string[] = [cookieA, cookieB].filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );

  // Prefer existing open cart for a candidate SID
  let openCartSid: string | undefined;
  for (const candidate of candidates) {
    const c = await db.query.carts.findFirst({
      where: and(eq(carts.sid, candidate), eq(carts.status, "open")),
      columns: { id: true },
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
    .where(and(eq(cartLines.cartId, cart.id), eq(cartLines.productId, Number(productId))));

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
        productId: Number(productId),
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

  // ✅ Attach staged uploads (upload-before-cart flow)
  // - only if draftId provided
  // - dedupe via unique(line_id, key) using onConflictDoNothing
  if (draftId) {
    const staged = await db
      .select()
      .from(artworkStaged)
      .where(and(eq(artworkStaged.sid, sid), eq(artworkStaged.draftId, draftId)));

    if (staged.length > 0) {
      for (const s of staged) {
        const key = norm((s as any).key);
        const url = norm((s as any).url);
        const fileName = norm((s as any).fileName) || "artwork";

        if (!key || !url) continue;

        await db
          .insert(cartAttachments)
          .values({
            lineId: line.id,
            productId: Number(productId),
            fileName,
            key,
            url,
          })
          .onConflictDoNothing({
            target: [cartAttachments.lineId, cartAttachments.key],
          });
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
  } catch (e) {
    log.error("/api/cart/lines POST error", {
      message: e instanceof Error ? e.message : String(e),
    });
    return noStore(jsonError(500, "Failed to add cart line", { requestId }));
  }
}
