import "server-only";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { getResendClient, getInvoicesFromEmail, getSupportEmail, getSupportPhone, getSupportUrl } from "@/lib/email/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

declare global {
  // eslint-disable-next-line no-var
  var __adapPgPool: Pool | undefined;

  // eslint-disable-next-line no-var
  var __adapRate: Map<string, { count: number; resetAt: number }> | undefined;
}

function getPool(): Pool {
  if (!global.__adapPgPool) {
    const cs = process.env.DATABASE_URL;
    if (!cs) throw new Error("Missing DATABASE_URL");
    global.__adapPgPool = new Pool({ connectionString: cs });
  }
  return global.__adapPgPool;
}

function s(v: unknown, max = 5000): string {
  const out = String(v ?? "").trim();
  if (!out) return "";
  return out.length > max ? out.slice(0, max) : out;
}

function requireEmail(raw: unknown): string {
  const email = s(raw, 320).toLowerCase();
  if (!email || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    throw new Error("Invalid email");
  }
  return email;
}

function ipFromHeaders(h: Headers): string {
  const xff = h.get("x-forwarded-for") || "";
  if (xff) return xff.split(",")[0].trim();
  const real = h.get("x-real-ip") || "";
  return real.trim();
}

function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://adapnow.com";
  return String(raw).trim().replace(/\/+$/, "");
}

function htmlEscape(x: string): string {
  return x
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rateLimitOrThrow(ip: string) {
  // Simple in-memory rate limit: 10 requests / 5 minutes per IP
  // (Good enough to stop spam bursts; can be swapped for Redis later.)
  const WINDOW_MS = 5 * 60 * 1000;
  const MAX = 10;

  if (!global.__adapRate) global.__adapRate = new Map();
  const key = ip || "unknown";
  const now = Date.now();
  const row = global.__adapRate.get(key);

  if (!row || now > row.resetAt) {
    global.__adapRate.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  row.count += 1;
  if (row.count > MAX) {
    const retrySeconds = Math.max(1, Math.ceil((row.resetAt - now) / 1000));
    const err: any = new Error("Too many requests. Please try again shortly.");
    err.status = 429;
    err.retryAfter = retrySeconds;
    throw err;
  }
}

async function logEmailOutbox(args: {
  client: any;
  provider?: string;
  messageType: string;
  toEmail: string;
  fromEmail: string;
  subject: string;
  status: "queued" | "sent" | "failed";
  resendId?: string | null;
  error?: string | null;
  relatedTable?: string | null;
  relatedId?: string | null;
}) {
  const q = `
    INSERT INTO email_outbox (
      provider, message_type, to_email, from_email, subject,
      resend_id, status, error, related_table, related_id,
      sent_at, failed_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      CASE WHEN $7='sent' THEN now() ELSE NULL END,
      CASE WHEN $7='failed' THEN now() ELSE NULL END
    )
  `;
  const vals = [
    args.provider || "resend",
    args.messageType,
    args.toEmail,
    args.fromEmail,
    args.subject,
    args.resendId || null,
    args.status,
    args.error || null,
    args.relatedTable || null,
    args.relatedId || null,
  ];
  await args.client.query(q, vals);
}

function quoteCustomerHtml(args: {
  name: string;
  requestId: string;
  productType: string;
  notes?: string;
}) {
  const brand = "ADAP";
  const tagline = "Custom Print Experts";
  const supportEmail = getSupportEmail();
  const supportPhone = getSupportPhone();
  const supportUrl = getSupportUrl();
  const base = siteBaseUrl();

  return `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#f6f7fb; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e6e8ef; border-radius:14px; overflow:hidden;">
      <div style="padding:18px 20px; background:#0047ab; color:#fff;">
        <div style="font-weight:800; font-size:18px; letter-spacing:.2px;">${brand}</div>
        <div style="opacity:.9; font-size:12px;">${tagline}</div>
      </div>
      <div style="padding:20px;">
        <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">Quote request received ✅</h1>
        <p style="margin:0 0 12px; color:#334155; line-height:1.5;">
          Hi ${htmlEscape(args.name || "there")}, we got your quote request for <b>${htmlEscape(args.productType || "a product")}</b>.
        </p>

        <div style="border:1px solid #eef0f6; background:#fafbff; border-radius:12px; padding:12px 14px; color:#0f172a;">
          <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Request ID</div>
          <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight:700;">${htmlEscape(args.requestId)}</div>
        </div>

        ${
          args.notes
            ? `<div style="margin-top:12px;">
                 <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Your notes</div>
                 <div style="border:1px solid #eef0f6; border-radius:12px; padding:12px 14px; color:#0f172a; white-space:pre-wrap;">${htmlEscape(args.notes)}</div>
               </div>`
            : ""
        }

        <p style="margin:14px 0 0; color:#334155; line-height:1.5;">
          We usually respond within <b>1–2 business days</b>. If you’re on a deadline, reply to this email and tell us the date.
        </p>

        <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
          <a href="${base}/guides" style="display:inline-block; background:#ffffff; border:1px solid #dbe1ef; color:#0f172a; padding:10px 12px; border-radius:10px; text-decoration:none; font-weight:700; font-size:13px;">
            Artwork Guides (PDF)
          </a>
          <a href="${base}/shipping" style="display:inline-block; background:#ffffff; border:1px solid #dbe1ef; color:#0f172a; padding:10px 12px; border-radius:10px; text-decoration:none; font-weight:700; font-size:13px;">
            Shipping Options
          </a>
        </div>

        <hr style="border:none; border-top:1px solid #eef0f6; margin:18px 0;" />

        <div style="font-size:12px; color:#64748b; line-height:1.6;">
          Need help?
          ${supportEmail ? ` Email <a href="mailto:${supportEmail}" style="color:#0047ab; text-decoration:none;">${supportEmail}</a>.` : ""}
          ${supportPhone ? ` Call ${supportPhone}.` : ""}
          ${supportUrl ? ` Visit <a href="${supportUrl}" style="color:#0047ab; text-decoration:none;">Support</a>.` : ""}
        </div>
      </div>
    </div>
  </div>`;
}

function quoteInternalHtml(args: Record<string, string>) {
  const rows = Object.entries(args)
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:8px 10px; border-bottom:1px solid #eef0f6; color:#64748b; font-size:12px; width:180px;">${htmlEscape(k)}</td>
        <td style="padding:8px 10px; border-bottom:1px solid #eef0f6; color:#0f172a; font-size:13px;">${htmlEscape(v)}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#f6f7fb; padding:24px;">
    <div style="max-width:780px; margin:0 auto; background:#ffffff; border:1px solid #e6e8ef; border-radius:14px; overflow:hidden;">
      <div style="padding:14px 18px; background:#0f172a; color:#fff;">
        <div style="font-weight:800;">New Quote Request</div>
      </div>
      <div style="padding:18px;">
        <table style="width:100%; border-collapse:collapse; border:1px solid #eef0f6; border-radius:12px; overflow:hidden;">
          ${rows}
        </table>
      </div>
    </div>
  </div>`;
}

export async function POST(req: Request) {
  const h = new Headers(req.headers);
  const ua = s(h.get("user-agent") || "", 800);
  const ip = s(ipFromHeaders(h), 120);

  try {
    rateLimitOrThrow(ip);
  } catch (e: any) {
    const headers: Record<string, string> = {};
    if (e?.retryAfter) headers["retry-after"] = String(e.retryAfter);
    return NextResponse.json({ ok: false, error: s(e?.message || "Rate limited", 200) }, { status: e?.status || 429, headers });
  }

  let body: any = null;
  try {
    const ct = (h.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return NextResponse.json({ ok: false, error: "Expected application/json" }, { status: 415 });
    }
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot (bots will fill hidden "website" field)
  if (s(body?.website, 200)) {
    return NextResponse.json({ ok: true, id: null }, { status: 200 });
  }

  // Form fields (mirrors QuotesClient)
  const name = s(body?.name, 160);
  const company = s(body?.company, 200);
  const email = (() => {
    try { return requireEmail(body?.email); } catch { return ""; }
  })();
  const phone = s(body?.phone, 60);

  const productType = s(body?.productType, 200);
  const size = s(body?.size, 120);
  const colors = s(body?.colors, 120);
  const material = s(body?.material, 160);
  const finishing = s(body?.finishing, 200);
  const quantity = s(body?.quantity, 80);
  const notes = s(body?.notes, 5000);

  if (!name) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
  if (!productType) return NextResponse.json({ ok: false, error: "Product type is required" }, { status: 400 });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Duplicate guard: same email + same core payload within last 5 minutes
    const dup = await client.query(
      `
      SELECT id::text
      FROM quote_requests
      WHERE email = $1
        AND product_type = $2
        AND COALESCE(notes,'') = COALESCE($3,'')
        AND created_at >= now() - interval '5 minutes'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [email, productType, notes || ""]
    );

    let requestId = String(dup.rows?.[0]?.id || "");
    if (!requestId) {
      const ins = await client.query(
        `
        INSERT INTO quote_requests (
          name, company, email, phone,
          product_type, size, colors, material, finishing, quantity, notes,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'new')
        RETURNING id::text
        `,
        [
          name,
          company || null,
          email,
          phone || null,
          productType,
          size || null,
          colors || null,
          material || null,
          finishing || null,
          quantity || null,
          notes || null,
        ]
      );
      requestId = String(ins.rows?.[0]?.id || "");
    }

    const resend = getResendClient();
    const from = getInvoicesFromEmail();
    const replyToSupport = (getSupportEmail() || "").trim() || undefined;

    const internalTo =
      (process.env.SUPPORT_TO_EMAIL || "").trim() ||
      (getSupportEmail() || "").trim() ||
      email;

    const subjCustomer = `Quote request received — ${productType}`;
    const subjInternal = `New quote request — ${productType} — ${name}`;

    // Customer email (non-fatal if it fails)
    try {
      const { data, error } = await resend.emails.send({
        from,
        to: email,
        subject: subjCustomer,
        reply_to: replyToSupport,
        html: quoteCustomerHtml({ name, requestId, productType, notes: notes || undefined }),
      });
      if (error) throw error;

      await logEmailOutbox({
        client,
        messageType: "quote_received_customer",
        toEmail: email,
        fromEmail: from,
        subject: subjCustomer,
        status: "sent",
        resendId: data?.id || null,
        relatedTable: "quote_requests",
        relatedId: requestId,
      });
    } catch (e: any) {
      await logEmailOutbox({
        client,
        messageType: "quote_received_customer",
        toEmail: email,
        fromEmail: from,
        subject: subjCustomer,
        status: "failed",
        error: s(e?.message || e, 2000),
        relatedTable: "quote_requests",
        relatedId: requestId,
      });
    }

    // Internal email (non-fatal if it fails)
    try {
      const { data, error } = await resend.emails.send({
        from,
        to: internalTo,
        subject: subjInternal,
        reply_to: email, // replying goes to customer
        html: quoteInternalHtml({
          requestId,
          name,
          company,
          email,
          phone,
          productType,
          size,
          colors,
          material,
          finishing,
          quantity,
          notes,
          ip,
          userAgent: ua,
        }),
      });
      if (error) throw error;

      await logEmailOutbox({
        client,
        messageType: "quote_received_internal",
        toEmail: internalTo,
        fromEmail: from,
        subject: subjInternal,
        status: "sent",
        resendId: data?.id || null,
        relatedTable: "quote_requests",
        relatedId: requestId,
      });
    } catch (e: any) {
      await logEmailOutbox({
        client,
        messageType: "quote_received_internal",
        toEmail: internalTo,
        fromEmail: from,
        subject: subjInternal,
        status: "failed",
        error: s(e?.message || e, 2000),
        relatedTable: "quote_requests",
        relatedId: requestId,
      });
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: requestId }, { status: 200 });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ ok: false, error: s(e?.message || e, 1200) }, { status: 500 });
  } finally {
    client.release();
  }
}
