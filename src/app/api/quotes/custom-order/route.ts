import "server-only";

import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CustomOrderPayload = {
  company?: string;
  email?: string;
  phone?: string;
  quoteNumber?: string;
  po?: string;
  instructions?: string;
  expectedDate?: string;
  shippingOption?: string;

  // anti-spam
  website?: string;
  startedAtMs?: number;
  submittedAtMs?: number;
};

function jsonOk() {
  return NextResponse.json({ ok: true } as const);
}
function jsonErr(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message } as const, { status });
}

function s(v: unknown, max = 5000): string {
  const str = String(v ?? "").trim();
  if (!str) return "";
  return str.length > max ? str.slice(0, max) : str;
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function env(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function getClientIp(req: Request) {
  const h = req.headers;
  return (
    (h.get("x-forwarded-for") || "").split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/** Tiny in-memory rate limit (works per-instance). */
const RL_WINDOW_MS = 60_000;
const RL_MAX = 12;
const rl = new Map<string, { n: number; ts: number }>();
function rateLimit(key: string) {
  const now = Date.now();
  const cur = rl.get(key);
  if (!cur || now - cur.ts > RL_WINDOW_MS) {
    rl.set(key, { n: 1, ts: now });
    return { ok: true as const };
  }
  if (cur.n >= RL_MAX) return { ok: false as const };
  cur.n += 1;
  return { ok: true as const };
}

export async function POST(req: Request) {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) return jsonErr("Server misconfigured: missing RESEND_API_KEY", 500);

  const toSupport =
    env("SUPPORT_INBOX_EMAIL") ||
    env("NEXT_PUBLIC_SUPPORT_EMAIL") ||
    env("SUPPORT_EMAIL");

  if (!toSupport) return jsonErr("Server misconfigured: missing SUPPORT_INBOX_EMAIL", 500);

  const from = env("RESEND_FROM") || env("RESEND_FROM_EMAIL") || "";
  if (!from) return jsonErr("Server misconfigured: missing RESEND_FROM", 500);

  const ip = getClientIp(req);
  const rlKey = `custom:${ip}`;
  if (!rateLimit(rlKey).ok) return jsonErr("Too many requests. Please try again in a minute.", 429);

  let body: CustomOrderPayload = {};
  try {
    body = (await req.json()) as CustomOrderPayload;
  } catch {
    return jsonErr("Invalid JSON body");
  }

  // spam checks
  const honeypot = s(body.website, 200);
  if (honeypot) return jsonOk();

  const startedAt = Number(body.startedAtMs || 0);
  const submittedAt = Number(body.submittedAtMs || 0);
  if (Number.isFinite(startedAt) && Number.isFinite(submittedAt) && startedAt > 0 && submittedAt > 0) {
    const delta = submittedAt - startedAt;
    if (delta >= 0 && delta < 800) return jsonOk();
  }

  const company = s(body.company, 200);
  const email = s(body.email, 200).toLowerCase();
  const phone = s(body.phone, 80);
  const quoteNumber = s(body.quoteNumber, 120);

  const po = s(body.po, 120);
  const instructions = s(body.instructions, 4000);
  const expectedDate = s(body.expectedDate, 40);
  const shippingOption = s(body.shippingOption, 80);

  if (!company) return jsonErr("Missing company name");
  if (!email || !isEmail(email)) return jsonErr("Invalid email");
  if (!phone) return jsonErr("Missing phone");
  if (!quoteNumber) return jsonErr("Missing quote number");

  const subject = `Custom order submission — Quote #${quoteNumber}`;

  const rows: Array<[string, string]> = [
    ["Company", company],
    ["Email", email],
    ["Phone", phone],
    ["Quote Number", quoteNumber],
    ["PO", po || "—"],
    ["Expected Date", expectedDate || "—"],
    ["Shipping Option", shippingOption || "—"],
  ];

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.45;">
      <h2 style="margin: 0 0 12px;">New Custom Order Submission</h2>
      <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
        ${rows
          .map(
            ([k, v]) => `
          <tr>
            <td style="padding: 8px 10px; border: 1px solid #e5e7eb; background: #f8fafc; width: 180px;"><b>${escapeHtml(
              k
            )}</b></td>
            <td style="padding: 8px 10px; border: 1px solid #e5e7eb;">${escapeHtml(v)}</td>
          </tr>`
          )
          .join("")}
      </table>

      <h3 style="margin: 16px 0 8px;">Instructions</h3>
      <div style="border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px; background: #fff;">
        ${escapeHtml(instructions || "—").replaceAll("\n", "<br/>")}
      </div>

      <p style="margin-top: 14px; color: #64748b; font-size: 12px;">
        Source IP: ${escapeHtml(ip)} • Submitted: ${new Date().toISOString()}
      </p>
    </div>
  `;

  const resend = new Resend(apiKey);

  const supportSend = await resend.emails.send({
    from,
    to: [toSupport],
    subject,
    replyTo: email,
    html,
  });

  if (supportSend.error) {
    return jsonErr(`Failed to send email: ${supportSend.error.message || "Resend error"}`, 502);
  }

  // customer confirmation (best-effort)
  const confirmHtml = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.45;">
      <h2 style="margin: 0 0 8px;">We received your custom order ✅</h2>
      <p style="margin: 0 0 10px;">
        Thanks — we received your submission for <b>Quote #${escapeHtml(quoteNumber)}</b>.
        Our team will confirm details and next steps by email.
      </p>
      <p style="margin: 0; color: #64748b; font-size: 12px;">
        If anything is time-sensitive, reply to this email with a hard deadline.
      </p>
    </div>
  `;

  try {
    await resend.emails.send({
      from,
      to: [email],
      subject: `Custom order received — Quote #${quoteNumber}`,
      html: confirmHtml,
    });
  } catch {
    // ignore
  }

  return jsonOk();
}
