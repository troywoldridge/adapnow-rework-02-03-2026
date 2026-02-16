// src/app/api/orders/place/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { carts, cartLines, cartArtwork, orders } from "@/lib/db/schema";
import { getSinaliteAccessToken } from "@/lib/getSinaliteAccessToken";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * Orders: Place (Sinalite)
 *
 * Goals:
 * - Strict input validation (no placeholder defaults for shipping/billing).
 * - Use cookie sid by default; allow body.sid ONLY as a fallback (and never as the only source if cookie exists).
 * - Idempotency: if cart already submitted / order already created for cart, return the existing order.
 * - Stable response shape with requestId.
 */

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

/** Safe string coercion */
function toStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}

function toUpper2(v: unknown): string {
  return toStr(v, "").trim().toUpperCase();
}

function groupArtByLine(
  rows: Array<{ cartLineId: string; url: string; side?: string | null }>
): Record<string, { type: string; url: string }[]> {
  const g: Record<string, { type: string; url: string }[]> = {};
  for (const a of rows) {
    if (!g[a.cartLineId]) g[a.cartLineId] = [];
    g[a.cartLineId].push({
      type: (a.side || "front") as string,
      url: a.url,
    });
  }
  return g;
}

function toSinaliteItem(
  ln: { id: string; productId: number; optionIds?: number[] | null },
  files: { type: string; url: string }[]
) {
  return {
    productId: ln.productId,
    options: Array.isArray(ln.optionIds) ? ln.optionIds : [],
    files,
    extra: ln.id, // keep line id for traceability
  };
}

const BodySchema = z
  .object({
    sid: z.string().trim().min(1).optional(),

    // Optional shipping override. If omitted, we use whatever is stored on the cart.
    shipping: z
      .object({
        country: z.enum(["US", "CA"]).optional(),
        state: z.string().trim().min(1).max(64).optional(),
        zip: z.string().trim().min(3).max(16).optional(),
        method: z.string().trim().min(1).max(128).optional(),
        carrier: z.string().trim().max(128).optional(),
        cost: z.number().finite().nonnegative().optional(),
        days: z.number().int().positive().max(365).optional(),
        currency: z.enum(["USD", "CAD"]).optional(),
      })
      .strict()
      .optional(),

    // Optional billing override. If omitted, we use cart billing fields, falling back to shipping.
    billing: z
      .object({
        firstName: z.string().trim().min(1).max(80).optional(),
        lastName: z.string().trim().min(1).max(80).optional(),
        email: z.string().trim().email().optional(),
        addr: z.string().trim().min(1).max(200).optional(),
        addr2: z.string().trim().max(200).optional(),
        city: z.string().trim().min(1).max(100).optional(),
        state: z.string().trim().min(1).max(64).optional(),
        zip: z.string().trim().min(3).max(16).optional(),
        country: z.enum(["US", "CA"]).optional(),
        phone: z.string().trim().max(30).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function readSidFromCookies(): string | null {
  const jar = cookies();
  return jar.get("adap_sid")?.value ?? jar.get("sid")?.value ?? null;
}

function coalesceNonEmpty(...vals: Array<string | null | undefined>): string {
  for (const v of vals) {
    const s = (v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function requireNonEmpty(field: string, value: string) {
  if (!value.trim()) {
    const err = new Error(`missing_${field}`);
    (err as any).code = `missing_${field}`;
    throw err;
  }
}

function normalizeCountry(v: unknown): "US" | "CA" | "" {
  const c = toUpper2(v);
  if (c === "US" || c === "CA") return c;
  return "";
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const database = db;

    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "Invalid request body",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const body = parsed.data;

    // Prefer cookie sid; allow body sid only if cookie missing.
    const cookieSid = readSidFromCookies();
    const sid = coalesceNonEmpty(cookieSid, body.sid);

    if (!sid) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "missing_sid" },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const [cart] = await database
      .select()
      .from(carts)
      .where(and(eq(carts.sid, sid), eq(carts.status, "open")))
      .limit(1);

    if (!cart) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "cart_not_found" },
        { status: 404, headers: { "x-request-id": requestId } }
      );
    }

    // Idempotency: if we already created an order for this cart, return it.
    // (This protects against double-submit from UI retries, refreshes, etc.)
    const existing = await database
      .select()
      .from(orders as any)
      .where(eq((orders as any).cartId, String((cart as any).id)))
      .limit(1);

    if (existing?.[0]) {
      return NextResponse.json(
        { ok: true as const, requestId, order: existing[0], idempotent: true as const },
        { status: 200, headers: { "x-request-id": requestId } }
      );
    }

    const lines = await database
      .select()
      .from(cartLines)
      .where(eq(cartLines.cartId, (cart as any).id));

    if (!lines.length) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "no_lines" },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    // Shipping selection: body.shipping can override cart.selectedShipping.
    const selectedShipping = (body.shipping ?? (cart as any)?.selectedShipping ?? null) as any;

    // Build shipping fields from cart + override
    const shipCountry = normalizeCountry(
      selectedShipping?.country ?? (cart as any)?.shipCountry
    );
    const shipState = coalesceNonEmpty(
      selectedShipping?.state,
      (cart as any)?.shipState
    );
    const shipZip = coalesceNonEmpty(
      selectedShipping?.zip,
      (cart as any)?.shipZip
    );

    // Require address essentials (no placeholders).
    requireNonEmpty("shipCountry", shipCountry);
    requireNonEmpty("shipState", shipState);
    requireNonEmpty("shipZip", shipZip);

    const shipFirst = coalesceNonEmpty((cart as any)?.shipFirstName, (cart as any)?.billFirstName);
    const shipLast = coalesceNonEmpty((cart as any)?.shipLastName, (cart as any)?.billLastName);
    const shipEmail = coalesceNonEmpty((cart as any)?.shipEmail, (cart as any)?.billEmail);
    const shipAddr = coalesceNonEmpty((cart as any)?.shipAddr);
    const shipCity = coalesceNonEmpty((cart as any)?.shipCity);
    const shipPhone = coalesceNonEmpty((cart as any)?.shipPhone, (cart as any)?.billPhone);

    requireNonEmpty("shipFirstName", shipFirst);
    requireNonEmpty("shipLastName", shipLast);
    requireNonEmpty("shipEmail", shipEmail);
    requireNonEmpty("shipAddr", shipAddr);
    requireNonEmpty("shipCity", shipCity);

    const shipMethod = coalesceNonEmpty(selectedShipping?.method);

    requireNonEmpty("shipMethod", shipMethod);

    const shippingInfo = {
      ShipFName: toStr(shipFirst),
      ShipLName: toStr(shipLast),
      ShipEmail: toStr(shipEmail),
      ShipAddr: toStr(shipAddr),
      ShipAddr2: toStr((cart as any)?.shipAddr2, ""),
      ShipCity: toStr(shipCity),
      ShipState: toStr(shipState),
      ShipZip: toStr(shipZip),
      ShipCountry: toStr(shipCountry),
      ShipPhone: toStr(shipPhone, ""),
      ShipMethod: toStr(shipMethod),
    };

    // Billing: cart billing overrides shipping; body.billing overrides both.
    const b = body.billing ?? {};
    const billFirst = coalesceNonEmpty(b.firstName, (cart as any)?.billFirstName, shippingInfo.ShipFName);
    const billLast = coalesceNonEmpty(b.lastName, (cart as any)?.billLastName, shippingInfo.ShipLName);
    const billEmail = coalesceNonEmpty(b.email, (cart as any)?.billEmail, shippingInfo.ShipEmail);
    const billAddr = coalesceNonEmpty(b.addr, (cart as any)?.billAddr, shippingInfo.ShipAddr);
    const billCity = coalesceNonEmpty(b.city, (cart as any)?.billCity, shippingInfo.ShipCity);

    const billCountry = normalizeCountry(
      b.country ?? (cart as any)?.billCountry ?? shippingInfo.ShipCountry
    );
    const billState = coalesceNonEmpty(b.state, (cart as any)?.billState, shippingInfo.ShipState);
    const billZip = coalesceNonEmpty(b.zip, (cart as any)?.billZip, shippingInfo.ShipZip);

    requireNonEmpty("billFirstName", billFirst);
    requireNonEmpty("billLastName", billLast);
    requireNonEmpty("billEmail", billEmail);
    requireNonEmpty("billAddr", billAddr);
    requireNonEmpty("billCity", billCity);
    requireNonEmpty("billCountry", billCountry);
    requireNonEmpty("billState", billState);
    requireNonEmpty("billZip", billZip);

    const billingInfo = {
      BillFName: toStr(billFirst),
      BillLName: toStr(billLast),
      BillEmail: toStr(billEmail),
      BillAddr: toStr(billAddr),
      BillAddr2: toStr(b.addr2 ?? (cart as any)?.billAddr2 ?? shippingInfo.ShipAddr2, ""),
      BillCity: toStr(billCity),
      BillState: toStr(billState),
      BillZip: toStr(billZip),
      BillCountry: toStr(billCountry),
      BillPhone: toStr(b.phone ?? (cart as any)?.billPhone ?? shippingInfo.ShipPhone, ""),
    };

    // Artwork grouped by line
    let artworkByLine: Record<string, { type: string; url: string }[]> = {};
    const lineIds = lines.map((l: any) => String(l.id));
    if (lineIds.length) {
      const artRows = await database
        .select()
        .from(cartArtwork)
        .where(inArray(cartArtwork.cartLineId, lineIds));

      artworkByLine = groupArtByLine(
        artRows.map((a: any) => ({
          cartLineId: String(a.cartLineId),
          url: String(a.url),
          side: a.side ? String(a.side) : null,
        }))
      );
    }

    const items = lines.map((ln: any) =>
      toSinaliteItem(
        {
          id: String(ln.id),
          productId: Number(ln.productId),
          optionIds: ln.optionIds,
        },
        artworkByLine[String(ln.id)] || []
      )
    );

    // Optional: If your business rules require artwork before placing, enforce it here.
    // (Many print workflows do.)
    const missingArtwork = items.filter((it: any) => !Array.isArray(it.files) || it.files.length === 0);
    if (missingArtwork.length) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "missing_artwork",
          detail: { lineIds: missingArtwork.map((it: any) => it.extra) },
        },
        { status: 409, headers: { "x-request-id": requestId } }
      );
    }

    const rawToken = await getSinaliteAccessToken();
    const authHeader = /^Bearer\s/i.test(rawToken) ? rawToken : `Bearer ${rawToken}`;

    // Prefer official live API base by env; do not hard-code unless you truly use that host.
    const apiBase = (process.env.SINALITE_API_BASE || process.env.SINALITE_BASE_URL || "").trim();
    const base = apiBase ? apiBase.replace(/\/+$/, "") : "https://liveapi.sinalite.com";

    const placeRes = await fetch(`${base}/order/new`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: authHeader,
        "x-request-id": requestId,
      },
      body: JSON.stringify({ items, shippingInfo, billingInfo }),
    });

    const reply = await placeRes.json().catch(() => null);

    if (!placeRes.ok || (reply as any)?.status === "error") {
      return NextResponse.json(
        { ok: false as const, requestId, error: "sinalite_failed", detail: reply },
        { status: 502, headers: { "x-request-id": requestId } }
      );
    }

    const { userId } = await auth();

    // ProviderId/orderId normalization
    const providerOrderId =
      (reply as any)?.orderId?.toString?.() ??
      (reply as any)?.orderID?.toString?.() ??
      (reply as any)?.id?.toString?.() ??
      null;

    // Persist the order locally
    await database.insert(orders as any).values({
      userId: userId ?? null,
      sid,
      cartId: String((cart as any).id),

      // Keep these flexible (schema differs per project)
      provider: "sinalite",
      providerId: providerOrderId,

      // Legacy-compatible fields (if present in your schema)
      externalId: providerOrderId,

      status: "submitted",
      createdAt: new Date(),
      updatedAt: new Date(),

      // Save the outbound items for audit/debugging
      itemsJson: JSON.stringify(items),

      // Optionally store shipping selection
      shippingJson: JSON.stringify(selectedShipping ?? null),
    });

    await database
      .update(carts)
      .set({ status: "submitted" as any, updatedAt: new Date() as any })
      .where(eq(carts.id, (cart as any).id));

    return NextResponse.json(
      { ok: true as const, requestId, order: reply, providerId: providerOrderId },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (e: any) {
    const code = String(e?.code || "");
    const msg = String(e?.message || e);

    const status =
      code.startsWith("missing_") ? 400 : msg.startsWith("missing_") ? 400 : 500;

    return NextResponse.json(
      { ok: false as const, requestId, error: msg || "orders_place_failed" },
      { status, headers: { "x-request-id": requestId } }
    );
  }
}
