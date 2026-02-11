// src/lib/sendEmail.ts
import "server-only";

import { Resend } from "resend";
import type { ReactElement } from "react";

type EmailAddress = string;
type EmailAddressList = EmailAddress | EmailAddress[];

export interface SendEmailParams {
  to: EmailAddressList;
  subject: string;
  react?: ReactElement; // React Email component
  html?: string; // raw HTML alternative
  from?: string; // e.g. "ADAP <noreply@yourdomain.com>"
  replyTo?: EmailAddress;
  cc?: EmailAddressList;
  bcc?: EmailAddressList;
}

/**
 * Server-only email sender via Resend.
 * Supports either:
 * - `react`: a React Email component (rendered to HTML), or
 * - `html`: raw HTML
 *
 * If both are provided, `react` wins.
 */
export async function sendEmail(params: SendEmailParams) {
  const { to, subject, react, html, from, replyTo, cc, bcc } = params;

  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY environment variable.");
  }

  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error("Missing recipient email address.");
  }

  if (!subject || !String(subject).trim()) {
    throw new Error("Missing email subject.");
  }

  let emailHtml: string | undefined = html;

  if (react) {
    // Support both renderAsync and render depending on @react-email/render version.
    const mod = await import("@react-email/render");
    const renderAsync: ((el: ReactElement) => Promise<string>) | undefined =
      (mod as any).renderAsync;
    const renderSync: ((el: ReactElement) => string) | undefined = (mod as any).render;

    if (renderAsync) {
      emailHtml = await renderAsync(react);
    } else if (renderSync) {
      emailHtml = renderSync(react);
    } else {
      throw new Error("Unable to render React email: missing render/renderAsync export.");
    }
  }

  if (!emailHtml || !String(emailHtml).trim()) {
    throw new Error("No HTML content provided (provide `react` or `html`).");
  }

  const resend = new Resend(apiKey);

  return resend.emails.send({
    from: from ?? "ADAP <noreply@yourdomain.com>",
    to,
    subject: String(subject).trim(),
    html: emailHtml,
    // Resend accepts replyTo as a string; keep camelCase.
    ...(replyTo ? { replyTo } : {}),
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
  });
}
