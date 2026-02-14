import "server-only";

import { Resend } from "resend";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

function optEnv(name: string): string | undefined {
  const v = process.env[name];
  const s = v ? String(v).trim() : "";
  return s ? s : undefined;
}

export function getResendClient(): Resend {
  const key = mustEnv("RESEND_API_KEY");
  return new Resend(key);
}

export function getInvoicesFromEmail(): string {
  // Your env: INVOICES_FROM_EMAIL="ADAP Invoices <orders@adapnow.com>"
  // Fallback to a safe placeholder in dev (but still works if you set it)
  return optEnv("INVOICES_FROM_EMAIL") || "ADAP <no-reply@adapnow.com>";
}

export function getSupportEmail(): string | undefined {
  return optEnv("NEXT_PUBLIC_SUPPORT_EMAIL");
}

export function getSupportPhone(): string | undefined {
  // you said you don't have it yet; keep optional
  return optEnv("NEXT_PUBLIC_SUPPORT_PHONE");
}

export function getSupportUrl(): string | undefined {
  // optional (add later)
  return optEnv("NEXT_PUBLIC_SUPPORT_URL");
}
