// src/app/account/orders/[id]/invoice/email/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { loadOrderForInvoiceEmail } from "./shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readEnv(key: string): string | null {
  const v = process.env[key];
  if (!v) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function cleanId(s: unknown): string {
  return String(s ?? "").trim();
}

function moneyFmt(cents: number, currency: "USD" | "CAD") {
  const dollars = (Number(cents) || 0) / 100;
  const locale = currency === "CAD" ? "en-CA" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(dollars);
}

function jsonNoStore(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function siteBaseUrl(req: NextRequest): string {
  const env =
    readEnv("NEXT_PUBLIC_SITE_URL") ||
    readEnv("SITE_URL") ||
    null;

  if (env) return env.replace(/\/+$/, "");
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

/* ------------------------------ Resend ------------------------------ */
type ResendSendArgs = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

function getResendClient(): { emails: { send: (args: ResendSendArgs) => Promise<any> } } {
  const key = readEnv("RESEND_API_KEY");
  if (!key) throw new Error("Missing RESEND_API_KEY");

  // Lazy require so this file can compile even if resend isn't installed in some envs
  // (but in prod you should have it installed).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Resend } = require("resend");
  return new Resend(key);
}

async function getAuthedEmail(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const client = await clerkClient();
  const u = await client.users.getUser(userId);

  const primaryId = u.primaryEmailAddressId;
  const primary = u.emailAddresses.find((e) => e.id === primaryId)?.emailAddress;
  const fallback = u.emailAddresses[0]?.emailAddress;

  const email = String(primary || fallback || "").trim();
  return email || null;
}

function buildEmailHtml(opts: {
  brand: string;
  orderId: string;
  orderNumber?: string | null;
  currency: "USD" | "CAD";
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  creditsCents: number;
  totalCents: number;
  invoiceUrl: string;
  lines: Array<{
    productId: number | string;
    quantity: number | string;
    unitPriceCents: number | string | null;
    lineTotalCents: number | string | null;
  }>;
}) {
  const {
    brand,
    orderId,
    orderNumber,
    currency,
    subtotalCents,
    shippingCents,
    taxCents,
    creditsCents,
    totalCents,
    invoiceUrl,
    lines,
  } = opts;

  const safeNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const rows = lines
    .map((l) => {
      const pid = String(l.productId ?? "");
      const qty = safeNum(l.quantity);
      const unit = safeNum(l.unitPriceCents);
      const lineTotal = Number.isFinite(Number(l.lineTotalCents))
        ? Number(l.lineTotalCents)
        : unit * qty;

      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
            <div style="font-weight:600;color:#111;">Product ${pid}</div>
            <div style="font-size:12px;color:#666;">Qty: ${qty}</div>
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #eee;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
            ${moneyFmt(unit, currency)}
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #eee;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-weight:700;">
            ${moneyFmt(lineTotal, currency)}
          </td>
        </tr>
      `;
    })
    .join("");

  const headerOrder = orderNumber ? `Order #${orderNumber}` : `Order ${orderId.slice(0, 8)}`;

  const creditsRow =
    creditsCents > 0
      ? `<tr><td style="padding:6px 0;color:#065f46;">Loyalty credit</td><td align="right" style="padding:6px 0;color:#065f46;">−${moneyFmt(creditsCents, currency)}</td></tr>`
      : "";

  return `<!doctype html>
<html>
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${brand} Invoice</title>
  </head>
  <body style="margin:0;background:#f6f7fb;">
    <div style="max-width:680px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 20px;background:linear-gradient(135deg,#4f46e5,#2563eb);color:#fff;">
          <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:18px;font-weight:800;">
            ${brand}
          </div>
          <div style="margin-top:6px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:14px;opacity:.95;">
            Invoice for <b>${headerOrder}</b>
          </div>
        </div>

        <div style="padding:20px;">
          <p style="margin:0 0 14px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#111;">
            Here’s your invoice summary. You can view or download the PDF anytime using the button below.
          </p>

          <p style="margin:0 0 18px;">
            <a href="${invoiceUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 14px;border-radius:12px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-weight:700;font-size:14px;">
              View / Download Invoice PDF
            </a>
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead>
              <tr>
                <th align="left" style="padding:10px 0;border-bottom:1px solid #eee;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.08em;">
                  Item
                </th>
                <th align="right" style="padding:10px 0;border-bottom:1px solid #eee;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.08em;">
                  Unit
                </th>
                <th align="right" style="padding:10px 0;border-bottom:1px solid #eee;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.08em;">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              ${rows || ""}
            </tbody>
          </table>

          <div style="margin-top:14px;border-top:1px solid #eee;padding-top:12px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:14px;color:#111;">
              <tr><td style="padding:6px 0;color:#374151;">Subtotal</td><td align="right" style="padding:6px 0;">${moneyFmt(subtotalCents, currency)}</td></tr>
              <tr><td style="padding:6px 0;color:#374151;">Shipping</td><td align="right" style="padding:6px 0;">${moneyFmt(shippingCents, currency)}</td></tr>
              <tr><td style="padding:6px 0;color:#374151;">Tax</td><td align="right" style="padding:6px 0;">${moneyFmt(taxCents, currency)}</td></tr>
              ${creditsRow}
              <tr><td style="padding:10px 0;font-weight:800;border-top:1px solid #eee;">Total</td><td align="right" style="padding:10px 0;font-weight:800;border-top:1px solid #eee;">${moneyFmt(totalCents, currency)}</td></tr>
            </table>
          </div>

          <p style="margin:16px 0 0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:12px;color:#6b7280;">
            If you didn’t request this email, you can ignore it. Your account remains secure.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * POST /account/orders/[id]/invoice/email
 * Sends an invoice email to the authenticated user (preferred) or to an on-file order email if available.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const orderId = cleanId(params?.id);
  if (!orderId) return jsonNoStore({ ok: false, error: "Missing order id" }, { status: 400 });

  try {
    const loaded = await loadOrderForInvoiceEmail(orderId);
    if (!loaded) return jsonNoStore({ ok: false, error: "Order not found" }, { status: 404 });

    const { order, lines, currency } = loaded;

    const brand =
      readEnv("NEXT_PUBLIC_SITE_NAME") ||
      "American Design And Printing";

    const base = siteBaseUrl(req);
    const invoiceUrl = `${base}/account/orders/${encodeURIComponent(orderId)}/invoice`;

    // Prefer sending to the signed-in user's email (Clerk).
    // Fallback to common order email fields if present.
    const authedEmail = await getAuthedEmail();

    const orderEmail =
      cleanId((order as any).email) ||
      cleanId((order as any).customerEmail) ||
      cleanId((order as any).billingEmail) ||
      cleanId((order as any).shippingEmail) ||
      "";

    const to = authedEmail || orderEmail;
    if (!to) {
      return jsonNoStore(
        { ok: false, error: "No email address found for this order/account." },
        { status: 400 }
      );
    }

    const from =
      readEnv("EMAIL_FROM") ||
      readEnv("SUPPORT_EMAIL") ||
      "support@adap.com";

    const subjectBase =
      (order as any).orderNumber ? `Invoice for Order #${String((order as any).orderNumber)}` : `Invoice for Order ${orderId.slice(0, 8)}`;

    const subtotalCents = Number((order as any).subtotalCents) || 0;
    const shippingCents = Number((order as any).shippingCents) || 0;
    const taxCents = Number((order as any).taxCents) || 0;
    const creditsCents = Number((order as any).creditsCents ?? 0);
    const totalCents = Number((order as any).totalCents) || 0;

    const html = buildEmailHtml({
      brand,
      orderId,
      orderNumber: (order as any).orderNumber ? String((order as any).orderNumber) : null,
      currency,
      subtotalCents,
      shippingCents,
      taxCents,
      creditsCents,
      totalCents,
      invoiceUrl,
      lines,
    });

    const resend = getResendClient();
    await resend.emails.send({
      from,
      to,
      subject: `${brand} — ${subjectBase}`,
      html,
      text: `${brand}\n\n${subjectBase}\nInvoice: ${invoiceUrl}\nTotal: ${moneyFmt(totalCents, currency)}\n`,
    });

    return jsonNoStore({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("invoice email failed:", msg);
    return jsonNoStore({ ok: false, error: "Failed to send invoice email." }, { status: 500 });
  }
}

/**
 * GET is intentionally not supported for sending email.
 * Some clients might hit it; return 405.
 */
export async function GET() {
  return jsonNoStore({ ok: false, error: "Method not allowed" }, { status: 405 });
}
