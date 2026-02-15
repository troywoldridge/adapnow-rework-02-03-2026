import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

import { enforcePolicy } from "@/lib/authzPolicy";
import { apiError } from "@/lib/apiError";
import { getRequestId } from "@/lib/requestId";
import { withRequestId } from "@/lib/logger";
import {
  getResendClient,
  getInvoicesFromEmail,
  getSupportEmail,
  getSupportPhone,
  getSupportUrl,
} from "@/lib/email/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

declare global {
  // eslint-disable-next-line no-var
  var __adapPgPool: Pool | undefined;

  // eslint-disable-next-line no-var
  var __adapRate: Map<string, { count: number; resetAt: number }> | undefined;
}

function noStoreHeaders() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    pragma: "no-cache",
    expires: "0",
  } as const;
}

function jsonOk(requestId: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: true as const, requestId, ...(extra || {}) }, { headers: noStoreHeaders() });
}

function jsonErr(
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
  headers?: Record<string, string>,
) {
  return NextResponse.json(apiError(status, code, message, { requestId, details }), {
    status,
    headers: { ...noStoreHeaders(), ...(headers || {}) },
  });
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

function ipFromHeaders(h: Headers): string {
  const xff = h.get("x-forwarded-for") || "";
  if (xff) return xff.split(",")[0].trim();
  const real = h.get("x-real-ip") || "";
  return real.trim();
}

function rateLimitOrThrow(ip: string) {
  // Simple in-memory rate limit: 10 requests / 5 minutes per IP
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

function customerHtml(args: {
  company: string;
  requestId: string;
  quoteNumber: string;
  expectedDate?: string;
  shippingOption?: string;
  instructions?: string;
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
        <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">Custom order submitted ✅</h1>
        <p style="margin:0 0 12px; color:#334155; line-height:1.5;">
          Thanks! We received your custom order submission for <b>${htmlEscape(args.company)}</b>.
        </p>

        <div style="border:1px solid #eef0f6; background:#fafbff; border-radius:12px; padding:12px 14px; color:#0f172a;">
          <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Request ID</div>
          <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight:700;">${htmlEscape(args.requestId)}</div>
          <div style="height:10px;"></div>
          <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Quote Number</div>
          <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight:700;">${htmlEscape(args.quoteNumber)}</div>
        </div>

        <div style="margin-top:12px; color:#0f172a;">
          ${args.expectedDate ? `<div><b>Expected date:</b> ${htmlEscape(args.expectedDate)}</div>` : ""}
          ${args.shippingOption ? `<div><b>Shipping option:</b> ${htmlEscape(args.shippingOption)}</div>` : ""}
        </div>

        ${
          args.instructions
            ? `<div style="margin-top:12px;">
                 <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Instructions</div>
                 <div style="border:1px solid #eef0f6; border-radius:12px; padding:12px 14px; color:#0f172a; white-space:pre-wrap;">${htmlEscape(args.instructions)}</div>
               </div>`
            : ""
        }

        <p style="margin:14px 0 0; color:#334155; line-height:1.5;">
          We’ll confirm the details by email. If artwork approval is time-sensitive, reply with your hard deadline.
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

function internalHtml(args: Record<string, string>) {
  const rows = Object.entries(args)
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:8px 10px; border-bottom:1px solid #eef0f6; color:#64748b; font-size:12px; width:180px;">${htmlEscape(k)}</td>
        <td style="padding:8px 10px; border-bottom:1px solid #eef0f6; color:#0f172a; font-size:13px;">${htmlEscape(v)}</td>
      </tr>`,
    )
    .join("");

  return `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#f6f7fb; padding:24px;">
    <div style="max-width:780px; margin:0 auto; background:#ffffff; border:1px solid #e6e8ef; border-radius:14px; overflow:hidden;">
      <div style="padding:14px 18px; background:#0f172a; color:#fff;">
        <div style="font-weight:800;">New Custom Order Submission</div>
      </div>
      <div style="padding:18px;">
        <table style="width:100%; border-collapse:collapse; border:1px solid #eef0f6; border-radius:12px; overflow:hidden;">
          ${rows}
        </table>
      </div>
    </div>
  </div>`;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const log = withRequestId(requestId);

  // Stage 2: policy boundary (public route, but standardized)
  const guard = await enforcePolicy(req, { kind: "public" });
  if (!guard.ok) return guard.res;

  const h = new Headers(req.headers);
  const ua = s(h.get("user-agent") || "", 800);
  const ip = s(ipFromHeaders(h), 120);

  try {
    rateLimitOrThrow(ip);
  } catch (e: any) {
    const retryAfter = e?.retryAfter ? String(e.retryAfter) : undefined;
    return jsonErr(
      e?.status || 429,
      "RATE_LIMITED",
      s(e?.message || "Rate limited", 200),
      requestId,
      null,
      retryAfter ? { "retry-after": retryAfter } : undefined,
    );
  }

  let body: any = null;
  try {
    const ct = (h.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return jsonErr(415, "BAD_REQUEST", "Expected application/json", requestId);
    }
    body = await req.json();
  } catch {
    return jsonErr(400, "BAD_REQUEST", "Invalid JSON", requestId);
  }

  // Honeypot (bots fill hidden website field)
  if (s(body?.website, 200)) {
    return jsonOk(requestId, { id: null });
  }

  const company = s(body?.company, 220);
  const email = (() => {
    try {
      return requireEmail(body?.email);
    } catch {
      return "";
    }
  })();
  const phone = s(body?.phone, 60);

  const quoteNumber = s(body?.quoteNumber, 80);
  const po = s(body?.po, 80);

  const instructions = s(body?.instructions, 5000);
  const expectedDate = s(body?.expectedDate, 20);
  const shippingOption = s(body?.shippingOption, 80);
  const artworkNote = s(body?.artworkNote, 300);

  if (!company) return jsonErr(400, "VALIDATION_ERROR", "Company is required", requestId);
  if (!email) return jsonErr(400, "VALIDATION_ERROR", "Valid email is required", requestId);
  if (!phone) return jsonErr(400, "VALIDATION_ERROR", "Phone is required", requestId);
  if (!quoteNumber) return jsonErr(400, "VALIDATION_ERROR", "Quote number is required", requestId);

  const pool = getPool();
  const client = await pool.connect();

  const createdAtIso = new Date().toISOString();

  try {
    await client.query("BEGIN");

    // Duplicate guard: same email + same quoteNumber within last 5 minutes
    const dup = await client.query(
      `
      SELECT id::text
      FROM custom_order_requests
      WHERE email = $1
        AND quote_number = $2
        AND created_at >= now() - interval '5 minutes'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [email, quoteNumber],
    );

    let requestRowId = String(dup.rows?.[0]?.id || "");
    if (!requestRowId) {
      const ins = await client.query(
        `
        INSERT INTO custom_order_requests (
          company, email, phone,
          quote_number, po,
          instructions,
          expected_date,
          shipping_option,
          artwork_note,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,
          CASE WHEN $7='' THEN NULL ELSE $7::date END,
          $8,$9,'new'
        )
        RETURNING id::text
        `,
        [
          company,
          email,
          phone,
          quoteNumber,
          po || null,
          instructions || null,
          expectedDate || "",
          shippingOption || null,
          artworkNote || null,
        ],
      );
      requestRowId = String(ins.rows?.[0]?.id || "");
    }

    const resend = getResendClient();
    const from = getInvoicesFromEmail();
    const replyToSupport = (getSupportEmail() || "").trim() || undefined;

    // Stage 2: canonical internal destination env first
    const internalTo =
      (process.env.SUPPORT_TO_EMAIL || "").trim() ||
      (getSupportEmail() || "").trim() ||
      email;

    const subjCustomer = `Custom order received — Quote ${quoteNumber}`;
    const subjInternal = `New custom order — Quote ${quoteNumber} — ${company}`;

    // Customer email (non-fatal)
    try {
      const { data, error } = await resend.emails.send({
        from,
        to: email,
        subject: subjCustomer,
        reply_to: replyToSupport,
        html: customerHtml({
          company,
          requestId: requestRowId,
          quoteNumber,
          expectedDate: expectedDate || undefined,
          shippingOption: shippingOption || undefined,
          instructions: instructions || undefined,
        }),
      });
      if (error) throw error;

      await logEmailOutbox({
        client,
        messageType: "custom_order_customer",
        toEmail: email,
        fromEmail: from,
        subject: subjCustomer,
        status: "sent",
        resendId: data?.id || null,
        relatedTable: "custom_order_requests",
        relatedId: requestRowId,
      });
    } catch (e: any) {
      const msg = s(e?.message || e, 2000);
      log.warn("custom order customer email failed", { message: msg, requestId });
      await logEmailOutbox({
        client,
        messageType: "custom_order_customer",
        toEmail: email,
        fromEmail: from,
        subject: subjCustomer,
        status: "failed",
        error: msg,
        relatedTable: "custom_order_requests",
        relatedId: requestRowId,
      });
    }

    // Internal email (non-fatal)
    try {
      const { data, error } = await resend.emails.send({
        from,
        to: internalTo,
        subject: subjInternal,
        reply_to: email, // replying goes to customer
        html: internalHtml({
          requestId: requestRowId,
          quoteNumber,
          company,
          email,
          phone,
          po,
          expectedDate,
          shippingOption,
          instructions,
          artworkNote,
          ip,
          userAgent: ua,
          createdAt: createdAtIso,
        }),
      });
      if (error) throw error;

      await logEmailOutbox({
        client,
        messageType: "custom_order_internal",
        toEmail: internalTo,
        fromEmail: from,
        subject: subjInternal,
        status: "sent",
        resendId: data?.id || null,
        relatedTable: "custom_order_requests",
        relatedId: requestRowId,
      });
    } catch (e: any) {
      const msg = s(e?.message || e, 2000);
      log.warn("custom order internal email failed", { message: msg, requestId });
      await logEmailOutbox({
        client,
        messageType: "custom_order_internal",
        toEmail: internalTo,
        fromEmail: from,
        subject: subjInternal,
        status: "failed",
        error: msg,
        relatedTable: "custom_order_requests",
        relatedId: requestRowId,
      });
    }

    await client.query("COMMIT");
    return jsonOk(requestId, { id: requestRowId });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    const msg = s(e?.message || e, 1200);
    log.error("custom order route failed", { message: msg, requestId });

    return jsonErr(500, "INTERNAL_ERROR", msg || "Failed to submit custom order", requestId);
  } finally {
    client.release();
  }
}
