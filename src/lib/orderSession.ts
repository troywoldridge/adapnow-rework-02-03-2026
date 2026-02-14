import "server-only";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { orderSessions } from "@/lib/db/schema";

type ShippingTuple = [carrier: string, service: string, price: number, available: number];

export type ShippingInfo = {
  ShipFName: string;
  ShipLName: string;
  ShipEmail: string;
  ShipAddr: string;
  ShipAddr2?: string;
  ShipCity: string;
  ShipState: string;
  ShipZip: string;
  ShipCountry: string;
  ShipPhone: string;
};

export type BillingInfo = {
  BillFName: string;
  BillLName: string;
  BillEmail: string;
  BillAddr: string;
  BillAddr2?: string;
  BillCity: string;
  BillState: string;
  BillZip: string;
  BillCountry: string;
  BillPhone: string;
};

export interface OrderSession {
  id: string;
  userId?: string | null;

  productId: string;
  options: (number | string)[] | Record<string, unknown>;
  files?: { type: string; url: string }[];

  shippingInfo?: ShippingInfo | null;
  billingInfo?: BillingInfo | null;

  currency: string;

  // Exposed as numbers in app code (safe for sums)
  subtotal: number;
  tax: number;
  discount: number;
  total: number;

  selectedShippingRate?: ShippingTuple | null;

  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  sinaliteOrderId?: string | number | null;

  notes?: string | null;

  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

const COOKIE_KEY = "orderSessionId";

type Row = typeof orderSessions.$inferSelect;
type Insert = typeof orderSessions.$inferInsert;

type CookieJar = Awaited<ReturnType<typeof cookies>>;

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * STRICT money parsing:
 * - If number: accept finite, >=0, format to 2 decimals.
 * - If string: require /^\d+(\.\d{2})$/ exactly (e.g. "38.95")
 *
 * Returns:
 * - valueNumber: number for app usage
 * - valueString: "0.00" string for DB storage
 */
function parseMoneyStrict(v: unknown, fallback = "0.00"): { valueNumber: number; valueString: string } {
  // numbers are allowed (we normalize)
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) {
      const fb = fallback;
      const fbNum = Number(fb);
      return { valueNumber: Number.isFinite(fbNum) ? fbNum : 0, valueString: fb };
    }
    const norm = v.toFixed(2);
    return { valueNumber: Number(norm), valueString: norm };
  }

  const raw = s(v);
  if (!raw) {
    const fb = fallback;
    const fbNum = Number(fb);
    return { valueNumber: Number.isFinite(fbNum) ? fbNum : 0, valueString: fb };
  }

  // strict: must look like 38.95 (always 2 decimals)
  if (!/^\d+(\.\d{2})$/.test(raw)) {
    const fb = fallback;
    const fbNum = Number(fb);
    return { valueNumber: Number.isFinite(fbNum) ? fbNum : 0, valueString: fb };
  }

  const asNum = Number(raw);
  if (!Number.isFinite(asNum) || asNum < 0) {
    const fb = fallback;
    const fbNum = Number(fb);
    return { valueNumber: Number.isFinite(fbNum) ? fbNum : 0, valueString: fb };
  }

  // already strict 2dp, keep as-is
  return { valueNumber: asNum, valueString: raw };
}

async function getJar(): Promise<CookieJar> {
  // Next has flipped cookies() between sync/async in different releases.
  const maybe = cookies() as unknown;
  if (typeof (maybe as { then?: unknown })?.then === "function") {
    return (await (maybe as Promise<CookieJar>)) as CookieJar;
  }
  return maybe as CookieJar;
}

/* ---------------- mapping helpers ---------------- */

function toModel(row: Row): OrderSession {
  const r = row as unknown as Record<string, unknown>;

  const subtotal = parseMoneyStrict(r.subtotal);
  const tax = parseMoneyStrict(r.tax);
  const discount = parseMoneyStrict(r.discount);
  const total = parseMoneyStrict(r.total);

  return {
    id: s(r.id),
    userId: (r.userId as string | null | undefined) ?? null,

    productId: s(r.productId),
    options: (r.options as any) ?? [],
    files: (r.files as any) ?? [],

    shippingInfo: (r.shippingInfo as ShippingInfo | null | undefined) ?? null,
    billingInfo: (r.billingInfo as BillingInfo | null | undefined) ?? null,

    currency: s(r.currency) || "USD",

    subtotal: subtotal.valueNumber,
    tax: tax.valueNumber,
    discount: discount.valueNumber,
    total: total.valueNumber,

    selectedShippingRate: (r.selectedShippingRate as ShippingTuple | null | undefined) ?? null,

    stripeCheckoutSessionId: (r.stripeCheckoutSessionId as string | null | undefined) ?? null,
    stripePaymentIntentId: (r.stripePaymentIntentId as string | null | undefined) ?? null,
    sinaliteOrderId: (r.sinaliteOrderId as string | number | null | undefined) ?? null,

    notes: (r.notes as string | null | undefined) ?? null,

    createdAt: (r.createdAt as any) ?? null,
    updatedAt: (r.updatedAt as any) ?? null,
  };
}

function toInsert(initial: Partial<OrderSession>): Insert {
  const productId = s(initial.productId);
  if (!productId) throw new Error("productId is required to create an order session");

  const options =
    Array.isArray(initial.options)
      ? initial.options
      : isRecord(initial.options)
        ? initial.options
        : [];

  const files = Array.isArray(initial.files) ? initial.files : [];

  const subtotal = parseMoneyStrict(initial.subtotal);
  const tax = parseMoneyStrict(initial.tax);
  const discount = parseMoneyStrict(initial.discount);
  const total = parseMoneyStrict(initial.total);

  const insert: Partial<Insert> = {
    productId,
    options: options as any,
    files: files as any,

    shippingInfo: (initial.shippingInfo ?? null) as any,
    billingInfo: (initial.billingInfo ?? null) as any,

    currency: s(initial.currency) || "USD",

    // DB storage: always "38.95" style strings
    subtotal: subtotal.valueString as any,
    tax: tax.valueString as any,
    discount: discount.valueString as any,
    total: total.valueString as any,

    selectedShippingRate: (initial.selectedShippingRate ?? null) as any,

    stripeCheckoutSessionId: (initial.stripeCheckoutSessionId ?? null) as any,
    stripePaymentIntentId: (initial.stripePaymentIntentId ?? null) as any,
    sinaliteOrderId:
      initial.sinaliteOrderId === undefined || initial.sinaliteOrderId === null
        ? (null as any)
        : (String(initial.sinaliteOrderId) as any),

    notes: (initial.notes ?? null) as any,
  };

  if (initial.userId !== undefined) {
    (insert as any).userId = initial.userId ?? null;
  }

  return insert as Insert;
}

/* ---------------- cookie helpers ---------------- */

export async function getOrderSessionIdFromCookie(): Promise<string | null> {
  const jar = await getJar();
  const v = jar.get(COOKIE_KEY)?.value ?? null;
  return v ? s(v) : null;
}

export async function setOrderSessionCookie(id: string) {
  const jar = await getJar();
  const value = s(id);
  if (!value) return;

  jar.set(COOKIE_KEY, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearOrderSessionCookie() {
  const jar = await getJar();
  jar.set(COOKIE_KEY, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/* ---------------- public API ---------------- */

export async function createOrderSession(initial: Partial<OrderSession>): Promise<OrderSession> {
  const [row] = await db.insert(orderSessions).values(toInsert(initial)).returning();
  await setOrderSessionCookie(String((row as any).id));
  return toModel(row);
}

export async function getOrderSession(): Promise<OrderSession | null> {
  const id = await getOrderSessionIdFromCookie();
  if (!id) return null;
  return await getOrderSessionById(id);
}

export async function getOrderSessionById(id: string): Promise<OrderSession | null> {
  const sid = s(id);
  if (!sid) return null;

  const [row] = await db.select().from(orderSessions).where(eq(orderSessions.id, sid)).limit(1);
  return row ? toModel(row) : null;
}

/**
 * Patch cookie session (or a provided id) with strict money normalization.
 */
export async function updateOrderSession(
  patch: Partial<OrderSession>,
  opts?: { id?: string }
): Promise<OrderSession | null> {
  const id = s(opts?.id) || (await getOrderSessionIdFromCookie()) || "";
  if (!id) return null;

  const set: Record<string, unknown> = {};

  if (patch.userId !== undefined) set.userId = patch.userId ?? null;

  if (patch.productId !== undefined) set.productId = s(patch.productId);

  if (patch.options !== undefined) {
    const options =
      Array.isArray(patch.options)
        ? patch.options
        : isRecord(patch.options)
          ? patch.options
          : [];
    set.options = options as any;
  }

  if (patch.files !== undefined) set.files = (Array.isArray(patch.files) ? patch.files : []) as any;

  if (patch.shippingInfo !== undefined) set.shippingInfo = (patch.shippingInfo ?? null) as any;
  if (patch.billingInfo !== undefined) set.billingInfo = (patch.billingInfo ?? null) as any;

  if (patch.currency !== undefined) set.currency = s(patch.currency) || "USD";

  if (patch.subtotal !== undefined) set.subtotal = parseMoneyStrict(patch.subtotal).valueString;
  if (patch.tax !== undefined) set.tax = parseMoneyStrict(patch.tax).valueString;
  if (patch.discount !== undefined) set.discount = parseMoneyStrict(patch.discount).valueString;
  if (patch.total !== undefined) set.total = parseMoneyStrict(patch.total).valueString;

  if (patch.selectedShippingRate !== undefined) {
    set.selectedShippingRate = (patch.selectedShippingRate ?? null) as any;
  }

  if (patch.stripeCheckoutSessionId !== undefined) {
    set.stripeCheckoutSessionId = patch.stripeCheckoutSessionId ?? null;
  }
  if (patch.stripePaymentIntentId !== undefined) {
    set.stripePaymentIntentId = patch.stripePaymentIntentId ?? null;
  }
  if (patch.sinaliteOrderId !== undefined) {
    set.sinaliteOrderId =
      patch.sinaliteOrderId === null || patch.sinaliteOrderId === undefined
        ? null
        : String(patch.sinaliteOrderId);
  }

  if (patch.notes !== undefined) set.notes = patch.notes ?? null;

  set.updatedAt = sql`now()`;

  const [row] = await db
    .update(orderSessions)
    .set(set as any)
    .where(eq(orderSessions.id, id))
    .returning();

  return row ? toModel(row) : null;
}

export async function markOrderPaid(orderSessionId: string, stripePaymentIntentId: string) {
  const id = s(orderSessionId);
  const pi = s(stripePaymentIntentId);
  if (!id || !pi) return;

  await db
    .update(orderSessions)
    .set({ stripePaymentIntentId: pi, updatedAt: sql`now()` } as any)
    .where(eq(orderSessions.id, id));
}

export async function setStripeCheckoutSessionId(orderSessionId: string, checkoutSessionId: string) {
  const id = s(orderSessionId);
  const cs = s(checkoutSessionId);
  if (!id || !cs) return;

  await db
    .update(orderSessions)
    .set({ stripeCheckoutSessionId: cs, updatedAt: sql`now()` } as any)
    .where(eq(orderSessions.id, id));
}

export async function saveSinaliteOrderId(orderSessionId: string, sinaliteOrderId: number) {
  const id = s(orderSessionId);
  if (!id) return;

  await db
    .update(orderSessions)
    .set({ sinaliteOrderId: String(sinaliteOrderId), updatedAt: sql`now()` } as any)
    .where(eq(orderSessions.id, id));
}

export async function getOrderSessionByStripeSession(
  sessionId: string,
  paymentIntentId?: string
): Promise<OrderSession | null> {
  const sid = s(sessionId);
  const pi = s(paymentIntentId);

  if (pi) {
    const [a] = await db
      .select()
      .from(orderSessions)
      .where(eq(orderSessions.stripePaymentIntentId, pi))
      .limit(1);
    if (a) return toModel(a);
  }

  if (!sid) return null;

  const [b] = await db
    .select()
    .from(orderSessions)
    .where(eq(orderSessions.stripeCheckoutSessionId, sid))
    .limit(1);

  return b ? toModel(b) : null;
}
