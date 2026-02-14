import "server-only";

import QuoteRequestReceivedEmail from "@/emails/QuoteRequestReceivedEmail";
import CustomOrderReceivedEmail from "@/emails/CustomOrderReceivedEmail";
import {
  getResendClient,
  getInvoicesFromEmail,
  getSupportEmail,
  getSupportPhone,
} from "@/lib/email/resend";

function safeText(v: unknown): string {
  return String(v ?? "").trim();
}

function mustEmail(v: unknown, label: string): string {
  const s = safeText(v);
  if (!s) throw new Error(`Missing ${label}`);
  return s;
}

function notifyEmailFromEnv(key: string, fallback: string) {
  const raw = process.env[key];
  const v = safeText(raw);
  return v || fallback;
}

export async function sendQuoteRequestEmails(args: {
  toCustomer: string;
  customerName: string;
  requestId: string;
  productType: string;
  details: Array<{ label: string; value: string }>;
  notes?: string;
}) {
  const resend = getResendClient();
  const from = getInvoicesFromEmail();

  const supportEmail = getSupportEmail();
  const supportPhone = getSupportPhone();

  const internalTo = notifyEmailFromEnv("QUOTES_NOTIFY_EMAIL", supportEmail || mustEmail(from, "from email"));

  const subjectCustomer = `Quote request received — ${args.productType}`;
  const subjectInternal = `NEW QUOTE — ${args.productType} (${args.customerName})`;

  const customer = await resend.emails.send({
    from,
    to: mustEmail(args.toCustomer, "customer email"),
    subject: subjectCustomer,
    react: (
      <QuoteRequestReceivedEmail
        name={args.customerName}
        requestId={args.requestId}
        productType={args.productType}
        lines={args.details}
        notes={safeText(args.notes) || undefined}
        supportEmail={supportEmail || undefined}
        supportPhone={supportPhone || undefined}
        brandName="ADAP"
        brandTagline="Custom Print Experts"
      />
    ),
    replyTo: supportEmail ? [supportEmail] : undefined,
  });

  if (customer.error) {
    throw new Error(`Resend customer quote email failed: ${String((customer.error as any)?.message || customer.error)}`);
  }

  const internal = await resend.emails.send({
    from,
    to: internalTo,
    subject: subjectInternal,
    react: (
      <QuoteRequestReceivedEmail
        name={args.customerName}
        requestId={args.requestId}
        productType={args.productType}
        lines={[
          { label: "Customer Email", value: args.toCustomer },
          ...args.details,
        ]}
        notes={safeText(args.notes) || undefined}
        supportEmail={supportEmail || undefined}
        supportPhone={supportPhone || undefined}
        brandName="ADAP"
        brandTagline="Custom Print Experts"
      />
    ),
    replyTo: supportEmail ? [supportEmail] : undefined,
  });

  if (internal.error) {
    throw new Error(`Resend internal quote email failed: ${String((internal.error as any)?.message || internal.error)}`);
  }

  return { ok: true };
}

export async function sendCustomOrderEmails(args: {
  toCustomer: string;
  company: string;
  requestId: string;
  quoteNumber: string;
  details: Array<{ label: string; value: string }>;
  instructions?: string;
}) {
  const resend = getResendClient();
  const from = getInvoicesFromEmail();

  const supportEmail = getSupportEmail();
  const supportPhone = getSupportPhone();

  const internalTo = notifyEmailFromEnv("CUSTOM_ORDERS_NOTIFY_EMAIL", supportEmail || mustEmail(from, "from email"));

  const subjectCustomer = `Custom order submitted — Quote #${args.quoteNumber}`;
  const subjectInternal = `NEW CUSTOM ORDER — Quote #${args.quoteNumber} (${args.company})`;

  const customer = await resend.emails.send({
    from,
    to: mustEmail(args.toCustomer, "customer email"),
    subject: subjectCustomer,
    react: (
      <CustomOrderReceivedEmail
        company={args.company}
        requestId={args.requestId}
        quoteNumber={args.quoteNumber}
        lines={args.details}
        instructions={safeText(args.instructions) || undefined}
        supportEmail={supportEmail || undefined}
        supportPhone={supportPhone || undefined}
        brandName="ADAP"
        brandTagline="Custom Print Experts"
      />
    ),
    replyTo: supportEmail ? [supportEmail] : undefined,
  });

  if (customer.error) {
    throw new Error(`Resend customer custom order email failed: ${String((customer.error as any)?.message || customer.error)}`);
  }

  const internal = await resend.emails.send({
    from,
    to: internalTo,
    subject: subjectInternal,
    react: (
      <CustomOrderReceivedEmail
        company={args.company}
        requestId={args.requestId}
        quoteNumber={args.quoteNumber}
        lines={[
          { label: "Customer Email", value: args.toCustomer },
          ...args.details,
        ]}
        instructions={safeText(args.instructions) || undefined}
        supportEmail={supportEmail || undefined}
        supportPhone={supportPhone || undefined}
        brandName="ADAP"
        brandTagline="Custom Print Experts"
      />
    ),
    replyTo: supportEmail ? [supportEmail] : undefined,
  });

  if (internal.error) {
    throw new Error(`Resend internal custom order email failed: ${String((internal.error as any)?.message || internal.error)}`);
  }

  return { ok: true };
}
