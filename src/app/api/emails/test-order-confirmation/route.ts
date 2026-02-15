// src/app/api/emails/test-order-confirmation/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { withRequestId } from "@/lib/logger";
import { getRequestId } from "@/lib/requestId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AnyObj = Record<string, unknown>;

function toStr(v: unknown, fallback = ""): string {
  const s = String(v ?? fallback).trim();
  return s;
}

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function noStoreHeaders() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    pragma: "no-cache",
    expires: "0",
  } as const;
}

function applyNoStore(res: NextResponse) {
  Object.entries(noStoreHeaders()).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const log = withRequestId(requestId);

  try {
    const body = (await req.json().catch(() => ({}))) as AnyObj;

    const to = toStr(body?.to);
    const subject = toStr(body?.subject, "Test: Order Confirmation");

    const orderNumber = toStr(body?.orderNumber, "TEST-ORDER-0001");
    const placedAt = toStr(body?.placedAt, new Date().toISOString());
    const currency = toStr(body?.currency, "USD");

    const totalsRaw = (body?.totals ?? {}) as AnyObj;
    const totals = {
      subtotal: toNum(totalsRaw?.subtotal, 0),
      shipping: toNum(totalsRaw?.shipping, 0),
      tax: toNum(totalsRaw?.tax, 0),
      discount: toNum(totalsRaw?.discount, 0),
      total: toNum(totalsRaw?.total, 0),
    };

    const customerRaw = (body?.customer ?? {}) as AnyObj;
    const customer = {
      name: toStr(customerRaw?.name, "Test Customer"),
      email: toStr(customerRaw?.email, to || "test@example.com"),
    };

    const itemsIn = body?.items;
    const items = Array.isArray(itemsIn)
      ? itemsIn.map((it: any, idx: number) => ({
          index: idx,
          name: toStr(it?.name, `Item ${idx + 1}`),
          quantity: toNum(it?.quantity, 1),
          unitPrice: toNum(it?.unitPrice, 0),
        }))
      : [];

    if (!to) {
      const res = NextResponse.json(
        { ok: false as const, error: "Missing 'to' in request body", requestId },
        { status: 400 },
      );
      return applyNoStore(res);
    }

    // Optional: attempt to send email if your sendEmail helper exists.
    // If not available, we still return a preview envelope (keeps this route usable).
    let sendResult: unknown = null;
    try {
      const mod: any = await import("@/lib/email/sendEmail");
      const fn = mod?.sendEmail || mod?.default;
      if (typeof fn === "function") {
        sendResult = await fn({
          to,
          subject,
          // lightweight html/plain preview (keeps this route independent of react-email setup)
          html: `<h2>Order Confirmation (Test)</h2>
<p><strong>Order:</strong> ${orderNumber}</p>
<p><strong>Placed:</strong> ${placedAt}</p>
<p><strong>Customer:</strong> ${customer.name} (${customer.email})</p>
<p><strong>Total:</strong> ${totals.total} ${currency}</p>`,
          text: `Order Confirmation (Test)\nOrder: ${orderNumber}\nPlaced: ${placedAt}\nCustomer: ${customer.name} (${customer.email})\nTotal: ${totals.total} ${currency}`,
        });
      }
    } catch {
      // ignore (preview-only)
    }

    const res = NextResponse.json(
      {
        ok: true as const,
        to,
        subject,
        orderNumber,
        placedAt,
        currency,
        totals,
        customer,
        items,
        sent: Boolean(sendResult),
        sendResult,
        requestId,
      },
      { status: 200 },
    );
    return applyNoStore(res);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to process test order confirmation";
    log.error("test-order-confirmation error", { message, requestId });

    const res = NextResponse.json({ ok: false as const, error: message, requestId }, { status: 500 });
    return applyNoStore(res);
  }
}
