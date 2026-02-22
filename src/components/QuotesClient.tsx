"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Tab = "quote" | "custom";

type QuoteFormState = {
  name: string;
  company: string;
  email: string;
  phone: string;

  productType: string;
  size: string;
  colors: string;
  material: string;
  finishing: string;
  quantity: string;

  deadline: string; // YYYY-MM-DD
  shipToZip: string;
  blindShip: boolean;

  notes: string;

  // Honeypot (spam trap)
  website: string;
};

type CustomOrderState = {
  company: string;
  email: string;
  phone: string;
  quoteNumber: string;
  po: string;

  expectedDate: string; // YYYY-MM-DD
  shippingOption: string;

  instructions: string;

  // Honeypot
  website: string;
};

const DRAFT_KEY = "adap_quotes_draft_v1";

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isLikelyEmail(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  // simple practical email check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function encodeMailto(params: {
  to: string;
  subject: string;
  body: string;
}): string {
  const to = encodeURIComponent(params.to);
  const subject = encodeURIComponent(params.subject);
  const body = encodeURIComponent(params.body);
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

async function postJson(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    credentials: "include",
  });

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  return { res, data };
}

function apiMissingOrNotReady(res: Response) {
  // Covers: route not built, wrong method, not implemented
  return res.status === 404 || res.status === 405 || res.status === 501;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-md px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-blue-600 text-white shadow"
          : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-sm font-semibold text-slate-800">{children}</span>;
}

function InputBase({
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={[
        "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400",
        "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
        className,
      ].join(" ")}
    />
  );
}

function TextAreaBase({
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={[
        "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400",
        "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
        className,
      ].join(" ")}
    />
  );
}

function SelectBase({
  options,
  className = "",
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: string[] }) {
  return (
    <select
      {...rest}
      className={[
        "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900",
        "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
        className,
      ].join(" ")}
    >
      <option value="" />
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        {hint ? <span className="block text-xs text-slate-600">{hint}</span> : null}
      </span>
    </label>
  );
}

function InlineBanner({
  tone,
  title,
  children,
}: {
  tone: "success" | "error" | "info";
  title: string;
  children?: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : "border-blue-200 bg-blue-50 text-blue-900";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <div className="font-semibold">{title}</div>
      {children ? <div className="mt-1 text-sm opacity-90">{children}</div> : null}
    </div>
  );
}

export default function QuotesClient() {
  const router = useRouter();

  const supportEmail = useMemo(() => {
    const v = safeStr(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) || "support@adapnow.com";
    return v;
  }, []);

  const [tab, setTab] = useState<Tab>("quote");

  const [quote, setQuote] = useState<QuoteFormState>(() => ({
    name: "",
    company: "",
    email: "",
    phone: "",
    productType: "",
    size: "",
    colors: "",
    material: "",
    finishing: "",
    quantity: "",
    deadline: "",
    shipToZip: "",
    blindShip: true,
    notes: "",
    website: "",
  }));

  const [custom, setCustom] = useState<CustomOrderState>(() => ({
    company: "",
    email: "",
    phone: "",
    quoteNumber: "",
    po: "",
    expectedDate: "",
    shippingOption: "",
    instructions: "",
    website: "",
  }));

  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<
    | { tone: "success" | "error" | "info"; title: string; detail?: string; mailto?: string }
    | null
  >(null);

  // Restore drafts
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { tab?: Tab; quote?: Partial<QuoteFormState>; custom?: Partial<CustomOrderState> };
      if (parsed?.tab === "custom" || parsed?.tab === "quote") setTab(parsed.tab);
      if (parsed?.quote) setQuote((s) => ({ ...s, ...parsed.quote }));
      if (parsed?.custom) setCustom((s) => ({ ...s, ...parsed.custom }));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist drafts
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ tab, quote, custom }));
    } catch {
      // ignore
    }
  }, [tab, quote, custom]);

  const resetBanner = () => setBanner(null);

  const gotoThankYou = () => {
    try {
      router.push("/quotes/thank-you");
    } catch {
      window.location.assign("/quotes/thank-you");
    }
  };

  const quoteMailto = useMemo(() => {
    const subject = `Quote Request — ADAP`;
    const lines = [
      `Quote Request`,
      ``,
      `Name: ${quote.name}`,
      `Company: ${quote.company || "(not provided)"}`,
      `Email: ${quote.email}`,
      `Phone: ${quote.phone || "(not provided)"}`,
      ``,
      `Product Type: ${quote.productType}`,
      `Size: ${quote.size || "(not provided)"}`,
      `Colors: ${quote.colors || "(not provided)"}`,
      `Material: ${quote.material || "(not provided)"}`,
      `Finishing: ${quote.finishing || "(not provided)"}`,
      `Quantity: ${quote.quantity || "(not provided)"}`,
      ``,
      `Deadline: ${quote.deadline || "(not provided)"}`,
      `Ship To ZIP: ${quote.shipToZip || "(not provided)"}`,
      `Blind Ship: ${quote.blindShip ? "Yes" : "No"}`,
      ``,
      `Notes:`,
      `${quote.notes || "(none)"}`,
      ``,
      `---`,
      `Sent from: /quotes`,
      `Date: ${todayISO()}`,
    ].join("\n");

    return encodeMailto({ to: supportEmail, subject, body: lines });
  }, [quote, supportEmail]);

  const customMailto = useMemo(() => {
    const subject = `Custom Order Submission — ADAP`;
    const lines = [
      `Custom Order Submission`,
      ``,
      `Company: ${custom.company}`,
      `Email: ${custom.email}`,
      `Phone: ${custom.phone}`,
      `Quote Number: ${custom.quoteNumber}`,
      `PO: ${custom.po || "(not provided)"}`,
      ``,
      `Expected Date: ${custom.expectedDate || "(not provided)"}`,
      `Shipping Option: ${custom.shippingOption || "(not provided)"}`,
      ``,
      `Instructions:`,
      `${custom.instructions || "(none)"}`,
      ``,
      `---`,
      `Sent from: /quotes`,
      `Date: ${todayISO()}`,
    ].join("\n");

    return encodeMailto({ to: supportEmail, subject, body: lines });
  }, [custom, supportEmail]);

  const validateQuote = (): string | null => {
    if (quote.website) return "Spam detected.";
    if (!safeStr(quote.name)) return "Please enter your name.";
    if (!isLikelyEmail(quote.email)) return "Please enter a valid email address.";
    if (!safeStr(quote.productType)) return "Please choose a product type.";
    return null;
  };

  const validateCustom = (): string | null => {
    if (custom.website) return "Spam detected.";
    if (!safeStr(custom.company)) return "Please enter your company name.";
    if (!isLikelyEmail(custom.email)) return "Please enter a valid email address.";
    if (!safeStr(custom.phone)) return "Please enter a phone number.";
    if (!safeStr(custom.quoteNumber)) return "Please enter your approved quote number.";
    return null;
  };

  const submitQuote = useCallback(async () => {
    resetBanner();

    const problem = validateQuote();
    if (problem) {
      setBanner({ tone: "error", title: "Fix a couple things", detail: problem });
      return;
    }

    const payload = {
      kind: "quote",
      source: "quotes-page",
      name: safeStr(quote.name),
      company: safeStr(quote.company) || null,
      email: safeStr(quote.email),
      phone: safeStr(quote.phone) || null,
      productType: safeStr(quote.productType),
      size: safeStr(quote.size) || null,
      colors: safeStr(quote.colors) || null,
      material: safeStr(quote.material) || null,
      finishing: safeStr(quote.finishing) || null,
      quantity: safeStr(quote.quantity) || null,
      deadline: safeStr(quote.deadline) || null,
      shipToZip: safeStr(quote.shipToZip) || null,
      blindShip: Boolean(quote.blindShip),
      notes: safeStr(quote.notes) || null,
      ts: Date.now(),
    };

    setLoading(true);
    try {
      const { res, data } = await postJson("/api/quotes", payload);

      if (!res.ok) {
        if (apiMissingOrNotReady(res)) {
          setBanner({
            tone: "info",
            title: "We’ll open your email client to finish the request",
            detail:
              "Your quote request system isn’t wired up yet — no worries. Click the button below to send the request by email.",
            mailto: quoteMailto,
          });
          return;
        }
        const msg =
          (data && typeof data === "object" && "error" in (data as any) && String((data as any).error)) ||
          (typeof data === "string" ? data : "") ||
          `HTTP ${res.status}`;
        throw new Error(String(msg));
      }

      // Success (API)
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      gotoThankYou();
    } catch (e: any) {
      // network / transient: fallback mailto
      setBanner({
        tone: "info",
        title: "One more step: send via email",
        detail:
          "Looks like the quote endpoint isn’t reachable yet (or there was a temporary network hiccup). Click below to send your request by email.",
        mailto: quoteMailto,
      });
    } finally {
      setLoading(false);
    }
  }, [quote, quoteMailto]);

  const submitCustom = useCallback(async () => {
    resetBanner();

    const problem = validateCustom();
    if (problem) {
      setBanner({ tone: "error", title: "Fix a couple things", detail: problem });
      return;
    }

    const payload = {
      kind: "custom-order",
      source: "quotes-page",
      company: safeStr(custom.company),
      email: safeStr(custom.email),
      phone: safeStr(custom.phone),
      quoteNumber: safeStr(custom.quoteNumber),
      po: safeStr(custom.po) || null,
      expectedDate: safeStr(custom.expectedDate) || null,
      shippingOption: safeStr(custom.shippingOption) || null,
      instructions: safeStr(custom.instructions) || null,
      ts: Date.now(),
    };

    setLoading(true);
    try {
      const { res, data } = await postJson("/api/custom-orders", payload);

      if (!res.ok) {
        if (apiMissingOrNotReady(res)) {
          setBanner({
            tone: "info",
            title: "We’ll open your email client to finish the submission",
            detail:
              "Your custom order submission endpoint isn’t wired up yet — click below and we’ll email the details.",
            mailto: customMailto,
          });
          return;
        }
        const msg =
          (data && typeof data === "object" && "error" in (data as any) && String((data as any).error)) ||
          (typeof data === "string" ? data : "") ||
          `HTTP ${res.status}`;
        throw new Error(String(msg));
      }

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      gotoThankYou();
    } catch (e: any) {
      setBanner({
        tone: "info",
        title: "One more step: send via email",
        detail:
          "We couldn’t reach the submission endpoint yet (or there was a temporary issue). Click below to email your custom order details.",
        mailto: customMailto,
      });
    } finally {
      setLoading(false);
    }
  }, [custom, customMailto]);

  return (
    <div className="grid grid-cols-1 gap-4">
      {banner ? (
        <InlineBanner tone={banner.tone} title={banner.title}>
          {banner.detail ? <p className="mt-1">{banner.detail}</p> : null}
          {banner.mailto ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={banner.mailto}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
              >
                Email this request
              </a>
              <button
                type="button"
                onClick={resetBanner}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Keep editing
              </button>
            </div>
          ) : null}
        </InlineBanner>
      ) : null}

      {/* Tabs */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TabButton active={tab === "quote"} onClick={() => setTab("quote")}>
          Quote Request
        </TabButton>
        <TabButton active={tab === "custom"} onClick={() => setTab("custom")}>
          Submit Custom Order
        </TabButton>
      </div>

      {/* Trust helper strip */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true">✅</span> Fast response (1–2 business days)
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true">✅</span> Blind shipping available
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true">✅</span> Artwork help via <Link className="font-semibold underline underline-offset-4" href="/guides">Guides</Link>
          </span>
        </div>
      </div>

      {tab === "quote" ? (
        <form
          className="grid grid-cols-1 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) submitQuote();
          }}
        >
          {/* Honeypot */}
          <div className="hidden" aria-hidden="true">
            <label>
              Website
              <input
                value={quote.website}
                onChange={(e) => setQuote((s) => ({ ...s, website: e.target.value }))}
                autoComplete="off"
                tabIndex={-1}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Name *</FieldLabel>
              <InputBase
                value={quote.name}
                onChange={(e) => setQuote((s) => ({ ...s, name: e.target.value }))}
                placeholder="Your name"
                autoComplete="name"
                required
              />
            </label>

            <label className="block">
              <FieldLabel>Company</FieldLabel>
              <InputBase
                value={quote.company}
                onChange={(e) => setQuote((s) => ({ ...s, company: e.target.value }))}
                placeholder="Company (optional)"
                autoComplete="organization"
              />
            </label>

            <label className="block">
              <FieldLabel>Email *</FieldLabel>
              <InputBase
                type="email"
                value={quote.email}
                onChange={(e) => setQuote((s) => ({ ...s, email: e.target.value }))}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="block">
              <FieldLabel>Phone</FieldLabel>
              <InputBase
                value={quote.phone}
                onChange={(e) => setQuote((s) => ({ ...s, phone: e.target.value }))}
                placeholder="(optional)"
                autoComplete="tel"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Type of Product *</FieldLabel>
              <SelectBase
                value={quote.productType}
                onChange={(e) => setQuote((s) => ({ ...s, productType: e.target.value }))}
                options={[
                  "Business Cards",
                  "Postcards",
                  "Brochures",
                  "Flyers",
                  "Large Format Posters",
                  "Vinyl Banners",
                  "Signs (Foamcore / Coroplast / PVC)",
                  "Table Covers",
                  "Labels & Packaging",
                  "Apparel",
                  "Other",
                ]}
                required
              />
            </label>

            <label className="block">
              <FieldLabel>Size</FieldLabel>
              <InputBase
                value={quote.size}
                onChange={(e) => setQuote((s) => ({ ...s, size: e.target.value }))}
                placeholder='e.g. "24 × 36" or "3.5 × 2"'
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Colors</FieldLabel>
              <SelectBase
                value={quote.colors}
                onChange={(e) => setQuote((s) => ({ ...s, colors: e.target.value }))}
                options={["1 sided CMYK", "2 sided CMYK", "Spot + CMYK", "Black only", "Not sure"]}
              />
            </label>

            <label className="block">
              <FieldLabel>Stock / Material</FieldLabel>
              <InputBase
                value={quote.material}
                onChange={(e) => setQuote((s) => ({ ...s, material: e.target.value }))}
                placeholder="e.g. 16pt C2S, 13oz Vinyl"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Coating / Finishing</FieldLabel>
              <InputBase
                value={quote.finishing}
                onChange={(e) => setQuote((s) => ({ ...s, finishing: e.target.value }))}
                placeholder="e.g. Matte, Gloss, UV, Grommets"
              />
            </label>

            <label className="block">
              <FieldLabel>Quantity</FieldLabel>
              <InputBase
                value={quote.quantity}
                onChange={(e) => setQuote((s) => ({ ...s, quantity: e.target.value }))}
                inputMode="numeric"
                placeholder="e.g. 2500"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Deadline (optional)</FieldLabel>
              <InputBase
                type="date"
                value={quote.deadline}
                onChange={(e) => setQuote((s) => ({ ...s, deadline: e.target.value }))}
              />
            </label>

            <label className="block">
              <FieldLabel>Ship-to ZIP (optional)</FieldLabel>
              <InputBase
                value={quote.shipToZip}
                onChange={(e) => setQuote((s) => ({ ...s, shipToZip: e.target.value }))}
                placeholder="Helps us estimate shipping options"
              />
            </label>
          </div>

          <CheckboxRow
            checked={quote.blindShip}
            onChange={(v) => setQuote((s) => ({ ...s, blindShip: v }))}
            label="Blind ship this order (recommended)"
            hint="Neutral labeling so your customer sees your brand, not ours."
          />

          <label className="block">
            <FieldLabel>Project Notes</FieldLabel>
            <TextAreaBase
              rows={5}
              value={quote.notes}
              onChange={(e) => setQuote((s) => ({ ...s, notes: e.target.value }))}
              placeholder="Tell us anything important: hard deadline, destination details, finishing needs, usage context, or if you need guidance."
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Tip: If artwork isn’t ready, that’s okay — use{" "}
              <Link className="font-semibold underline underline-offset-4" href="/guides">
                Artwork Setup Guides
              </Link>{" "}
              to prevent delays.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Sending…" : "Request Quote"}
            </button>
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
            Prefer email?{" "}
            <a className="font-semibold underline underline-offset-4" href={quoteMailto}>
              Send this request via email
            </a>
            .
          </div>
        </form>
      ) : (
        <form
          className="grid grid-cols-1 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) submitCustom();
          }}
        >
          {/* Honeypot */}
          <div className="hidden" aria-hidden="true">
            <label>
              Website
              <input
                value={custom.website}
                onChange={(e) => setCustom((s) => ({ ...s, website: e.target.value }))}
                autoComplete="off"
                tabIndex={-1}
              />
            </label>
          </div>

          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <strong>Important:</strong> This is for customers with an <strong>approved quote number</strong>.
            If you don’t have one yet, use the Quote Request tab first.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Company Name *</FieldLabel>
              <InputBase
                value={custom.company}
                onChange={(e) => setCustom((s) => ({ ...s, company: e.target.value }))}
                placeholder="Company name"
                autoComplete="organization"
                required
              />
            </label>

            <label className="block">
              <FieldLabel>Email *</FieldLabel>
              <InputBase
                type="email"
                value={custom.email}
                onChange={(e) => setCustom((s) => ({ ...s, email: e.target.value }))}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="block">
              <FieldLabel>Phone *</FieldLabel>
              <InputBase
                value={custom.phone}
                onChange={(e) => setCustom((s) => ({ ...s, phone: e.target.value }))}
                placeholder="Phone number"
                autoComplete="tel"
                required
              />
            </label>

            <label className="block">
              <FieldLabel>Quote Number *</FieldLabel>
              <InputBase
                value={custom.quoteNumber}
                onChange={(e) => setCustom((s) => ({ ...s, quoteNumber: e.target.value }))}
                placeholder="From your approved quote"
                required
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>PO (optional)</FieldLabel>
              <InputBase
                value={custom.po}
                onChange={(e) => setCustom((s) => ({ ...s, po: e.target.value }))}
                placeholder="Purchase order"
              />
            </label>

            <label className="block">
              <FieldLabel>Shipping Option</FieldLabel>
              <SelectBase
                value={custom.shippingOption}
                onChange={(e) => setCustom((s) => ({ ...s, shippingOption: e.target.value }))}
                options={["Ship for me", "Blind ship to client", "Local pickup"]}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Expected Date (optional)</FieldLabel>
              <InputBase
                type="date"
                value={custom.expectedDate}
                onChange={(e) => setCustom((s) => ({ ...s, expectedDate: e.target.value }))}
              />
            </label>

            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
              <div className="font-semibold text-slate-700">Artwork upload</div>
              <div className="mt-1">
                Your R2 uploader can be wired here later. For now, submit instructions and we’ll reply with the
                best upload path.
              </div>
              <div className="mt-2">
                Need templates?{" "}
                <Link className="font-semibold underline underline-offset-4" href="/guides">
                  Download Artwork Guides
                </Link>
                .
              </div>
            </div>
          </div>

          <label className="block">
            <FieldLabel>Additional Notes</FieldLabel>
            <TextAreaBase
              rows={5}
              value={custom.instructions}
              onChange={(e) => setCustom((s) => ({ ...s, instructions: e.target.value }))}
              placeholder="Provide special instructions: finishing, packaging, inserts, blind-ship details, or hard deadlines."
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Custom jobs vary based on artwork approval + finishing. If your timeline is tight, include a hard deadline.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Submitting…" : "Submit Custom Order"}
            </button>
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
            Prefer email?{" "}
            <a className="font-semibold underline underline-offset-4" href={customMailto}>
              Email this submission
            </a>
            .
          </div>
        </form>
      )}
    </div>
  );
}
