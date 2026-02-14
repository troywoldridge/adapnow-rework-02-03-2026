import "server-only";

import React from "react";
import OrderConfirmationEmail from "@/emails/OrderConfirmationEmail";
import {
  getResendClient,
  getInvoicesFromEmail,
  getSupportEmail,
  getSupportPhone,
  getSupportUrl,
} from "@/lib/email/resend";

type MoneyLine = { label: string; value: string };

function money(cents: number, currency: "USD" | "CAD" = "USD"): string {
  const v = Number(cents || 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
}

function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://adapnow.com";
  return String(raw).trim().replace(/\/+$/, "");
}

function safeText(v: unknown): string {
  return String(v ?? "").trim();
}

export async function sendOrderConfirmationEmail(args: {
  to: string;
  name: string;
  orderId: string | number;

  currency?: "USD" | "CAD";
  subtotalCents?: number;
  shippingCents?: number;
  taxCents?: number;
  discountCents?: number;
  creditsCents?: number;
  totalCents: number;

  placedAt?: string | null;

  // Optional links
  orderUrl?: string;
  trackingUrl?: string;

  // Optional extra note
  note?: string;
}) {
  const to = safeText(args.to);
  if (!to) throw new Error("sendOrderConfirmationEmail: missing 'to'");

  const currency: "USD" | "CAD" = args.currency === "CAD" ? "CAD" : "USD";
  const total = money(args.totalCents, currency);

  const lines: MoneyLine[] = [];

  if (Number.isFinite(Number(args.subtotalCents))) lines.push({ label: "Subtotal", value: money(args.subtotalCents || 0, currency) });
  if (Number.isFinite(Number(args.shippingCents))) lines.push({ label: "Shipping", value: money(args.shippingCents || 0, currency) });
  if (Number.isFinite(Number(args.taxCents))) lines.push({ label: "Tax", value: money(args.taxCents || 0, currency) });

  if ((args.discountCents || 0) > 0) lines.push({ label: "Discount", value: `−${money(args.discountCents || 0, currency)}` });
  if ((args.creditsCents || 0) > 0) lines.push({ label: "Loyalty credit", value: `−${money(args.creditsCents || 0, currency)}` });

  const placedAt = safeText(args.placedAt);
  const orderDate = placedAt ? new Date(placedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : undefined;

  const base = siteBaseUrl();
  const orderUrl =
    safeText(args.orderUrl) ||
    `${base}/account/orders/${encodeURIComponent(String(args.orderId))}`;

  const resend = getResendClient();
  const from = getInvoicesFromEmail();

  const subject = `Order confirmed — #${String(args.orderId)}`;

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    react: (
      <OrderConfirmationEmail
        name={args.name}
        orderId={args.orderId}
        orderTotal={total}
        orderDate={orderDate}
        orderUrl={orderUrl}
        trackingUrl={safeText(args.trackingUrl) || undefined}
        lines={lines.length ? lines : undefined}
        note={safeText(args.note) || undefined}
        supportEmail={getSupportEmail()}
        supportPhone={getSupportPhone()}
        supportUrl={getSupportUrl()}
        brandName="ADAP"
        brandTagline="Custom Print Experts"
      />
    ),
  });

  if (error) {
    const msg = (error as any)?.message ? String((error as any).message) : JSON.stringify(error);
    throw new Error(`Resend send failed: ${msg}`);
  }

  return { ok: true, id: data?.id || null };
}
