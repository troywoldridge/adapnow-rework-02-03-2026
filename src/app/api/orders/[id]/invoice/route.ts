// src/app/api/orders/[id]/invoice/route.ts
import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/orders/[id]/invoice
 *
 * Generates a PDF invoice for an order.
 *
 * Goals:
 * - TS-safe (no PDFKit namespace types)
 * - Buffer -> Uint8Array response body (BodyInit compatible)
 * - No-store responses
 * - Stable JSON error envelope
 */

const ParamsSchema = z.object({
  id: z.string().trim().min(1),
});

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function noStoreHeaders(requestId: string) {
  return {
    "x-request-id": requestId,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
  } as const;
}

function jsonError(requestId: string, status: number, message: string) {
  return NextResponse.json(
    { ok: false as const, requestId, error: message },
    { status, headers: noStoreHeaders(requestId) }
  );
}

async function pdfToBuffer(build: (doc: any) => void): Promise<Buffer> {
  // pdfkit streams data events
  const doc: any = new (PDFDocument as any)({
    size: "LETTER",
    margin: 50,
    // You can add: info: { Title: "...", Author: "..." }
  });

  const chunks: Buffer[] = [];

  return await new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: unknown) => reject(err));

    try {
      build(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function money(cents: unknown, currency: unknown): string {
  const c = typeof currency === "string" && currency.trim() ? currency.toUpperCase() : "USD";
  const n = Number(cents);
  const safe = Number.isFinite(n) ? n : 0;
  const dollars = safe / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(dollars);
  } catch {
    // fallback if currency code invalid
    return `$${dollars.toFixed(2)}`;
  }
}

function safeString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (v == null) return "";
  return String(v);
}

function drawInvoice(doc: any, args: { requestId: string; order: any }) {
  const { order, requestId } = args;

  // ---- Header ----
  doc.fontSize(20).text("Invoice", { align: "left" });
  doc.moveDown(0.3);

  doc
    .fontSize(10)
    .fillColor("#333")
    .text(`Invoice for Order: ${safeString(order.id)}`, { align: "left" });
  doc.text(`Request ID: ${requestId}`, { align: "left" });
  doc.text(`Date: ${new Date().toLocaleString()}`, { align: "left" });

  doc.moveDown(1);

  // ---- Company block (edit these defaults) ----
  doc.fontSize(12).fillColor("#000").text("ADAP / American Design And Printing");
  doc.fontSize(10).fillColor("#333").text("Thank you for your order!");
  doc.moveDown(1);

  // ---- Customer + Shipping ----
  const ship = (order as any).selectedShipping ?? (order as any).shipping ?? null;
  const shippingName =
    safeString(ship?.name) ||
    safeString((order as any).shippingName) ||
    safeString((order as any).customerName) ||
    "";
  const shippingLine1 =
    safeString(ship?.address1) ||
    safeString((order as any).shippingAddress1) ||
    safeString((order as any).address1) ||
    "";
  const shippingLine2 =
    safeString(ship?.address2) ||
    safeString((order as any).shippingAddress2) ||
    safeString((order as any).address2) ||
    "";
  const shippingCity =
    safeString(ship?.city) || safeString((order as any).shippingCity) || safeString((order as any).city) || "";
  const shippingState =
    safeString(ship?.state) || safeString((order as any).shippingState) || safeString((order as any).state) || "";
  const shippingPostal =
    safeString(ship?.postalCode) ||
    safeString((order as any).shippingPostalCode) ||
    safeString((order as any).postalCode) ||
    "";
  const shippingCountry =
    safeString(ship?.country) || safeString((order as any).shippingCountry) || safeString((order as any).country) || "";

  doc.fontSize(11).fillColor("#000").text("Ship To");
  doc.fontSize(10).fillColor("#333");
  if (shippingName) doc.text(shippingName);
  if (shippingLine1) doc.text(shippingLine1);
  if (shippingLine2) doc.text(shippingLine2);
  const cityLine = [shippingCity, shippingState, shippingPostal].filter(Boolean).join(", ");
  if (cityLine) doc.text(cityLine);
  if (shippingCountry) doc.text(shippingCountry);

  doc.moveDown(1);

  // ---- Items ----
  const itemsRaw =
    (order as any).items ??
    (order as any).orderItems ??
    (order as any).lines ??
    (order as any).cartLines ??
    [];

  const items = Array.isArray(itemsRaw) ? itemsRaw : [];

  doc.fontSize(11).fillColor("#000").text("Items");
  doc.moveDown(0.4);

  // Table-ish layout
  const startX = doc.x;
  const col1 = startX;
  const col2 = startX + 300;
  const col3 = startX + 400;

  doc.fontSize(10).fillColor("#000");
  doc.text("Description", col1, doc.y, { width: 290 });
  doc.text("Qty", col2, doc.y, { width: 80, align: "right" });
  doc.text("Total", col3, doc.y, { width: 120, align: "right" });
  doc.moveDown(0.2);
  doc.moveTo(startX, doc.y).lineTo(startX + 520, doc.y).strokeColor("#ccc").stroke();
  doc.moveDown(0.3);

  doc.fontSize(10).fillColor("#333");

  const currency = safeString((order as any).currency || (order as any).cartCurrency || "USD");

  for (const it of items) {
    const name =
      safeString((it as any).title) ||
      safeString((it as any).name) ||
      safeString((it as any).productName) ||
      "Item";

    const qty = Number((it as any).quantity ?? 1);
    const qtySafe = Number.isFinite(qty) && qty > 0 ? qty : 1;

    // Prefer line totals if present, otherwise unit*qty
    const lineTotalCents =
      Number((it as any).lineTotalCents ?? (it as any).totalCents ?? NaN);
    const unitCents =
      Number((it as any).unitPriceCents ?? (it as any).unitCents ?? NaN);

    const totalCents = Number.isFinite(lineTotalCents)
      ? lineTotalCents
      : Number.isFinite(unitCents)
        ? unitCents * qtySafe
        : 0;

    const {y} = doc;
    doc.text(name, col1, y, { width: 290 });
    doc.text(String(qtySafe), col2, y, { width: 80, align: "right" });
    doc.text(money(totalCents, currency), col3, y, { width: 120, align: "right" });

    doc.moveDown(0.6);
  }

  doc.moveDown(0.6);

  // ---- Totals ----
  // Duck-type totals so you can evolve schema freely
  const subtotalCents =
    Number((order as any).subtotalCents ?? (order as any).subtotal_cents ?? NaN);
  const shippingCents =
    Number((order as any).shippingCents ?? (order as any).shipping_cents ?? NaN);
  const taxCents =
    Number((order as any).taxCents ?? (order as any).tax_cents ?? NaN);
  const totalCents =
    Number((order as any).totalCents ?? (order as any).total_cents ?? NaN);

  const subtotal = Number.isFinite(subtotalCents) ? subtotalCents : 0;
  const shipping = Number.isFinite(shippingCents) ? shippingCents : 0;
  const tax = Number.isFinite(taxCents) ? taxCents : 0;

  // If total isn't stored, derive
  const computedTotal = subtotal + shipping + tax;
  const total = Number.isFinite(totalCents) ? totalCents : computedTotal;

  const totalsX = startX + 300;

  doc.fontSize(10).fillColor("#333");
  doc.text("Subtotal", totalsX, doc.y, { width: 120 });
  doc.text(money(subtotal, currency), totalsX + 120, doc.y, { width: 100, align: "right" });
  doc.moveDown(0.3);

  doc.text("Shipping", totalsX, doc.y, { width: 120 });
  doc.text(money(shipping, currency), totalsX + 120, doc.y, { width: 100, align: "right" });
  doc.moveDown(0.3);

  doc.text("Tax", totalsX, doc.y, { width: 120 });
  doc.text(money(tax, currency), totalsX + 120, doc.y, { width: 100, align: "right" });
  doc.moveDown(0.4);

  doc.moveTo(totalsX, doc.y).lineTo(totalsX + 220, doc.y).strokeColor("#ccc").stroke();
  doc.moveDown(0.4);

  doc.fontSize(12).fillColor("#000");
  doc.text("Total", totalsX, doc.y, { width: 120 });
  doc.text(money(total, currency), totalsX + 120, doc.y, { width: 100, align: "right" });

  doc.moveDown(1.2);

  doc.fontSize(9).fillColor("#666").text("If you have any questions, contact support.", { align: "left" });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  const requestId = getRequestId(req);

  try {
    const params = await Promise.resolve(ctx.params as any);
    const parsed = ParamsSchema.safeParse(params);

    if (!parsed.success) {
      return jsonError(requestId, 400, "Invalid order id");
    }

    const orderId = parsed.data.id;

    const [order] = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)) ?? [];

    if (!order) {
      return jsonError(requestId, 404, "Order not found");
    }

    const pdfBuf = await pdfToBuffer((doc) => drawInvoice(doc, { requestId, order }));

    // ✅ BodyInit compatible (avoids TS2345 on Buffer)
    const body = new Uint8Array(pdfBuf);

    const filenameSafe = `invoice_${safeString(orderId).replace(/[^a-zA-Z0-9_-]+/g, "_")}.pdf`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        ...noStoreHeaders(requestId),
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filenameSafe}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(requestId, 500, message || "Invoice generation failed");
  }
}