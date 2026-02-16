// src/app/api/cart/add/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { getOrEnsureSid } from "@/lib/getOrSetSid";

// ✅ update this import to your canonical pricing helper (server-side)
import { priceSinaliteProduct } from "@/lib/sinalite.pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
};

function requestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}

function syncSidCookies(res: NextResponse, sid: string) {
  res.cookies.set("adap_sid", sid, COOKIE_OPTS);
  res.cookies.set("sid", sid, COOKIE_OPTS);
}

function normalizeOptionIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  // de-dupe but preserve order
  return Array.from(new Set(out));
}

const BodySchema = z
  .object({
    productId: z.union([z.number(), z.string()]),
    optionIds: z.array(z.union([z.number(), z.string()])).min(1),
    quantity: z.union([z.number(), z.string()]).optional(),
    store: z.string().optional(), // "US" | "CA" | "CAD"
    currency: z.string().optional(), // optional alias
    cloudflareImageId: z.string().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const rid = requestId(req);

  // create response FIRST so Set-Cookie survives
  let seedRes = NextResponse.json({ ok: true, requestId: rid });

  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return noStore(
        NextResponse.json(
          {
            ok: false,
            requestId: rid,
            error: "invalid_body",
            issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 400 }
        )
      );
    }

    const productId = Number(parsed.data.productId);
    const optionIds = normalizeOptionIds(parsed.data.optionIds);
    const quantityRaw = parsed.data.quantity ?? 1;
    const quantity = Math.max(1, Math.floor(Number(quantityRaw) || 1));

    const storeRaw = String(parsed.data.store ?? parsed.data.currency ?? "US").toUpperCase();
    const store = storeRaw === "CA" || storeRaw === "CAD" ? "CA" : "US";

    const cloudflareImageId =
      typeof parsed.data.cloudflareImageId === "string" && parsed.data.cloudflareImageId.trim()
        ? parsed.data.cloudflareImageId.trim()
        : null;

    if (!Number.isFinite(productId) || productId <= 0 || optionIds.length === 0) {
      return noStore(
        NextResponse.json(
          { ok: false, requestId: rid, error: "productId and optionIds[] are required" },
          { status: 400 }
        )
      );
    }

    // ensure SID & sync both cookie names
    const sid = await getOrEnsureSid({ res: seedRes });
    syncSidCookies(seedRes, sid);

    // get or create open cart
    let cart = await db.query.carts.findFirst({
      where: and(eq(carts.sid, sid), eq(carts.status, "open")),
    });

    if (!cart) {
      const [created] = await db
        .insert(carts)
        .values({
          sid,
          status: "open",
          currency: store === "CA" ? "CAD" : "USD",
        })
        .returning();
      cart = created;
    }

    // live price via SinaLite (treat vendor response as unknown)
    const priced: any = await priceSinaliteProduct({ productId, optionIds, store });

    const unit = Number(priced?.unitPrice ?? priced?.unit ?? priced?.price ?? 0);
    if (!Number.isFinite(unit) || unit < 0) {
      return noStore(
        NextResponse.json({ ok: false, requestId: rid, error: "invalid_price" }, { status: 502 })
      );
    }

    const unitCents = Math.max(0, Math.round(unit * 100));
    const lineTotalCents = Math.max(0, unitCents * quantity);

    // Optional: enforce cart currency alignment
    const desiredCurrency = store === "CA" ? "CAD" : "USD";
    if ((cart as any)?.currency && (cart as any).currency !== desiredCurrency) {
      // keep it simple: update cart currency to match store for pricing correctness
      await db.update(carts).set({ currency: desiredCurrency as any }).where(eq(carts.id, cart.id));
    }

    const insertValues: typeof cartLines.$inferInsert = {
      cartId: cart.id,
      productId,
      optionIds, // jsonb
      quantity,
      unitPriceCents: unitCents,
      lineTotalCents,
      ...(cloudflareImageId ? { artwork: { image: cloudflareImageId } as any } : {}),
    };

    const [line] = await db
      .insert(cartLines)
      .values(insertValues)
      .returning({ id: cartLines.id });

    // Small cart summary for UX (optional but handy)
    const [{ count }] =
      (await db
        .select({ count: sql<number>`count(*)::int` })
        .from(cartLines)
        .where(eq(cartLines.cartId, cart.id))) ?? [{ count: 0 }];

    const out = NextResponse.json(
      {
        ok: true,
        requestId: rid,
        sid,
        cartId: cart.id,
        lineId: line.id,
        currency: desiredCurrency,
        quantity,
        unitPriceCents: unitCents,
        lineTotalCents,
        cartLineCount: count,
      },
      { headers: seedRes.headers }
    );

    // Ensure Set-Cookie headers survive
    syncSidCookies(out, sid);
    return noStore(out);
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "server_error");
    console.error("POST /api/cart/add failed:", msg);
    const out = NextResponse.json(
      { ok: false, requestId: rid, error: msg },
      { status: 500, headers: seedRes.headers }
    );
    return noStore(out);
  }
}
