import "server-only";

import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuotePayload = {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;

  productType?: string;
  size?: string;
  colors?: string;
  material?: string;
  finishing?: string;
  quantity?: string;
  notes?: string;

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
  // server-side pragmatic email check
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
  // best-effort; depends on hosting
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
  // Resend requires a verified sender/domain. In dev you *might* use onboarding@resend.dev, but don't rely on it.
  if (!from) return jsonErr("Server misconfigured: missing RESEND_FROM", 500);

  const ip = getClientIp(req);
  const rlKey = `quote:${ip}`;
  if (!rateLimit(rlKey).ok) return jsonErr("Too many requests. Please try again in a minute.", 429);

  let body: QuotePayload = {};
  try {
    body = (await req.json()) as QuotePayload;
  } catch {
    return jsonErr("Invalid JSON body");
  }

  // spam checks
  const honeypot = s(body.website, 200);
  if (honeypot) return jsonOk(); // pretend success

  const startedAt = Number(body.startedAtMs || 0);
  const submittedAt = Number(body.submittedAtMs || 0);
  if (Number.isFinite(startedAt) && Number.isFinite(submittedAt) && startedAt > 0 && submittedAt > 0) {
    const delta = submittedAt - startedAt;
    if (delta >= 0 && delta < 800) return jsonOk(); // too fast -> bot
  }

  const name = s(body.name, 120);
  const company = s(body.company, 200);
  const email = s(body.email, 200).toLowerCase();
  const phone = s(body.phone, 80);

  const productType = s(body.productType, 120);
  const size = s(body.size, 120);
  const colors = s(body.colors, 120);
  const material = s(body.material, 120);
  const finishing = s(body.finishing, 200);
  const quantity = s(body.quantity, 80);
  const notes = s(body.notes, 4000);

  if (!name) return jsonErr("Missing name");
  if (!email || !isEmail(email)) return jsonErr("Invalid email");
  if (!productType) return jsonErr("Missing product type");

  const subject = `Quote request: ${productType}${company ? ` — ${company}` : ""}`;

  const rows: Array<[string, string]> = [
    ["Name", name],
    ["Company", company || "—"],
    ["Email", email],
    ["Phone", phone || "—"],
    ["Product Type", productType],
    ["Size", size || "—"],
    ["Colors", colors || "—"],
    ["Material", material || "—"],
    ["Finishing", finishing || "—"],
    ["Quantity", quantity || "—"],
  ];

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.45;">
      <h2 style="margin: 0 0 12px;">New Quote Request</h2>
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

      <h3 style="margin: 16px 0 8px;">Notes</h3>
      <div style="border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px; background: #fff;">
        ${escapeHtml(notes || "—").replaceAll("\n", "<br/>")}
      </div>

      <p style="margin-top: 14px; color: #64748b; font-size: 12px;">
        Source IP: ${escapeHtml(ip)} • Submitted: ${new Date().toISOString()}
      </p>
    </div>
  `;

  const resend = new Resend(apiKey);

  // 1) Send to your support inbox
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

  // 2) Send a simple confirmation to the customer (best-effort)
  const confirmHtml = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.45;">
      <h2 style="margin: 0 0 8px;">We got your quote request ✅</h2>
      <p style="margin: 0 0 10px;">Hi ${escapeHtml(name)},</p>
      <p style="margin: 0 0 10px;">
        Thanks for reaching out. We received your request for <b>${escapeHtml(productType)}</b>.
        Our team will follow up by email with pricing and next steps.
      </p>
      <p style="margin: 0 0 10px; color: #64748b; font-size: 12px;">
        If you need anything urgent, reply to this email.
      </p>
    </div>
  `;

  // Don’t fail the whole request if confirmation email fails.
  try {
    await resend.emails.send({
      from,
      to: [email],
      subject: "Quote request received",
      html: confirmHtml,
    });
  } catch {
    // ignore
  }

  return jsonOk();
}
