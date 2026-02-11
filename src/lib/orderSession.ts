import "server-only";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderSessions } from "@/lib/db/schema";

type ShippingTuple = [
  carrier: string,
  service: string,
  price: number,
  available: number,
];

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
  options: (number | string)[] | Record<string, any>;
  files?: { type: string; url: string }[];

  shippingInfo?: ShippingInfo | null;
  billingInfo?: BillingInfo | null;

  currency: string;
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

/* ---------------- cookie helpers ---------------- */

type CookieJar = Awaited<ReturnType<typeof cookies>>;

async function getJar(): Promise<CookieJar> {
  // Next.js has historically shifted cookies() between sync and async in different builds.
  // This helper keeps your code compatible without needing conditional imports.
  const maybe = cookies() as unknown;
  if (typeof (maybe as any)?.then === "function") {
    return (await maybe) as CookieJar;
  }
  return maybe as CookieJar;
}

/* ---------------- mapping helpers ---------------- */

function num(v: unknown, fallback = 0): number {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(x) ? x : fallback;
}

function toModel(row: Row): OrderSession {
  const r: any = row;

  return {
    id: String(r.id),
    userId: r.userId ?? null,

    productId: String(r.productId ?? ""),
    options: r.options ?? [],
    files: r.files ?? [],

    shippingInfo: r.shippingInfo ?? null,
    billingInfo: r.billingInfo ?? null,

    currency: String(r.currency ?? "USD"),
    subtotal: num(r.subtotal, 0),
    tax: num(r.tax, 0),
    discount: num(r.discount, 0),
    total: num(r.total, 0),

    selectedShippingRate: r.selectedShippingRate ?? null,

    stripeCheckoutSessionId: r.stripeCheckoutSessionId ?? null,
    stripePaymentIntentId: r.stripePaymentIntentId ?? null,
    sinaliteOrderId: r.sinaliteOrderId ?? null,

    notes: r.notes ?? null,

    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
  };
}

function toInsert(initial: Partial<OrderSession>): Insert {
  const i = initial;

  const insert: any = {
    // required-ish fields
    productId: String(i.productId ?? ""),

    // json fields
    options: i.options ?? [],
    files: i.files ?? [],

    shippingInfo: i.shippingInfo ?? null,
    billingInfo: i.billingInfo ?? null,

    // money - db may store numeric/decimal; drizzle often represents as string on insert
    currency: i.currency ?? "USD",
    subtotal: String(i.subtotal ?? 0),
    tax: String(i.tax ?? 0),
    discount: String(i.discount ?? 0),
    total: String(i.total ?? 0),

    selectedShippingRate: i.selectedShippingRate ?? null,

    // set later
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    sinaliteOrderId: null,

    notes: i.notes ?? null,
  };

  // preserve intent: only set userId if provided at all
  if (i.userId !== undefined) insert.userId = i.userId ?? null;

  return insert as Insert;
}

/* ---------------- public API ---------------- */

export async function getOrderSessionIdFromCookie(): Promise<string | null> {
  const jar = await getJar();
  return jar.get(COOKIE_KEY)?.value ?? null;
}

export async function setOrderSessionCookie(id: string) {
  const jar = await getJar();
  jar.set(COOKIE_KEY, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearOrderSessionCookie() {
  const jar = await getJar();
  // MaxAge 0 is the most consistent “delete” across runtimes.
  jar.set(COOKIE_KEY, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function createOrderSession(
  initial: Partial<OrderSession>,
): Promise<OrderSession> {
  const [row] = await db.insert(orderSessions).values(toInsert(initial)).returning();
  await setOrderSessionCookie(String(row.id));
  return toModel(row);
}

export async function getOrderSession(): Promise<OrderSession | null> {
  const id = await getOrderSessionIdFromCookie();
  if (!id) return null;

  const [row] = await db
    .select()
    .from(orderSessions)
    .where(eq(orderSessions.id, id))
    .limit(1);

  return row ? toModel(row) : null;
}

export async function getOrderSessionById(id: string): Promise<OrderSession | null> {
  const [row] = await db
    .select()
    .from(orderSessions)
    .where(eq(orderSessions.id, id))
    .limit(1);

  return row ? toModel(row) : null;
}

export async function markOrderPaid(
  orderSessionId: string,
  stripePaymentIntentId: string,
) {
  await db
    .update(orderSessions)
    .set({
      stripePaymentIntentId,
      updatedAt: new Date(),
    } as any)
    .where(eq(orderSessions.id, orderSessionId));
}

export async function setStripeCheckoutSessionId(
  orderSessionId: string,
  checkoutSessionId: string,
) {
  await db
    .update(orderSessions)
    .set({
      stripeCheckoutSessionId: checkoutSessionId,
      updatedAt: new Date(),
    } as any)
    .where(eq(orderSessions.id, orderSessionId));
}

export async function saveSinaliteOrderId(
  orderSessionId: string,
  sinaliteOrderId: number | string,
) {
  await db
    .update(orderSessions)
    .set({
      sinaliteOrderId: String(sinaliteOrderId),
      updatedAt: new Date(),
    } as any)
    .where(eq(orderSessions.id, orderSessionId));
}

export async function getOrderSessionByStripeSession(
  sessionId: string,
  paymentIntentId?: string,
): Promise<OrderSession | null> {
  if (paymentIntentId) {
    const [a] = await db
      .select()
      .from(orderSessions)
      .where(eq(orderSessions.stripePaymentIntentId, paymentIntentId))
      .limit(1);

    if (a) return toModel(a);
  }

  const [b] = await db
    .select()
    .from(orderSessions)
    .where(eq(orderSessions.stripeCheckoutSessionId, sessionId))
    .limit(1);

  return b ? toModel(b) : null;
}
