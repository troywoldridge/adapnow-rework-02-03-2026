"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

type ApiOk = { ok: true };
type ApiErr = { ok: false; error: string };
type ApiResp = ApiOk | ApiErr;

type Tab = "quote" | "custom";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isEmail(s: string) {
  const v = s.trim();
  // pragmatic email check (client-side); server does stricter validation too
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
      className={cx(
        "w-full rounded-md px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-blue-600 text-white shadow"
          : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

async function postJson<T extends Record<string, unknown>>(url: string, payload: T): Promise<ApiResp> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json().catch(() => ({}))
    : { ok: false, error: await res.text().catch(() => "") };

  if (!res.ok || !data?.ok) {
    return { ok: false, error: String(data?.error || `HTTP ${res.status}`) };
  }
  return { ok: true };
}

export default function QuotesClient() {
  const [tab, setTab] = useState<Tab>("quote");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
        <h1 className="text-2xl font-bold text-slate-900">Custom Quotes & Orders</h1>
        <p className="mt-2 text-slate-600">
          Tell us what you need and we’ll price it fast. Our quotes follow production specs so the pricing matches
          what can actually be manufactured.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" role="tablist" aria-label="Quote tabs">
          <TabButton active={tab === "quote"} onClick={() => setTab("quote")}>
            Quote Request
          </TabButton>
          <TabButton active={tab === "custom"} onClick={() => setTab("custom")}>
            Custom Order Submission
          </TabButton>
        </div>

        <div className="mt-6" role="tabpanel">
          {tab === "quote" ? <QuoteForm /> : <CustomOrderForm />}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          <span className="font-semibold">Helpful:</span>
          <Link className="underline underline-offset-4 hover:text-blue-700" href="/guides">
            Artwork Setup Guides (PDF)
          </Link>
          <span className="opacity-50">|</span>
          <Link className="underline underline-offset-4 hover:text-blue-700" href="/shipping">
            Shipping Options
          </Link>
          <span className="opacity-50">|</span>
          <Link className="underline underline-offset-4 hover:text-blue-700" href="/turnaround">
            Turnaround Times
          </Link>
          <span className="opacity-50">|</span>
          <Link className="underline underline-offset-4 hover:text-blue-700" href="/guarantees">
            Our Guarantees
          </Link>
        </div>
      </section>
    </main>
  );
}

/* ----------------------------- Quote Request ----------------------------- */

function QuoteForm() {
  const startedAtRef = useRef<number>(Date.now());

  const [form, setForm] = useState({
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
    notes: "",
    // anti-spam honeypot
    website: "",
  });

  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  const canSubmit = useMemo(() => {
    if (status === "sending") return false;
    if (!form.name.trim()) return false;
    if (!isEmail(form.email)) return false;
    if (!form.productType.trim()) return false;
    return true;
  }, [form, status]);

  const update = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setStatus("idle");
    setMsg("");

    const payload = {
      ...form,
      startedAtMs: startedAtRef.current,
      submittedAtMs: Date.now(),
    };

    // client validation (server validates again)
    if (!payload.name.trim()) return fail("Please enter your name.");
    if (!isEmail(payload.email)) return fail("Please enter a valid email.");
    if (!payload.productType.trim()) return fail("Please select a product type.");

    setStatus("sending");

    const r = await postJson("/api/quotes/request", payload);
    if (!r.ok) return fail(r.error);

    setStatus("success");
    setMsg("Thanks! Your quote request was sent. We’ll follow up by email shortly.");

    // keep conversions high: don’t wipe everything instantly; clear the noisy bits
    setForm((p) => ({
      ...p,
      size: "",
      colors: "",
      material: "",
      finishing: "",
      quantity: "",
      notes: "",
      website: "",
    }));
  }

  function fail(m: string) {
    setStatus("error");
    setMsg(m || "Something went wrong. Please try again.");
  }

  return (
    <form className="grid grid-cols-1 gap-4" onSubmit={onSubmit} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Text value={form.name} onChange={update("name")} name="name" label="Name *" required />
        <Text value={form.company} onChange={update("company")} name="company" label="Company" />
        <Text value={form.email} onChange={update("email")} name="email" label="Email *" type="email" required />
        <Text value={form.phone} onChange={update("phone")} name="phone" label="Phone" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          value={form.productType}
          onChange={update("productType")}
          name="productType"
          label="Type of Product *"
          required
          options={[
            "Business Cards",
            "Postcards",
            "Brochures",
            "Large Format Posters",
            "Vinyl Banners",
            "Table Covers",
            "Labels & Packaging",
            "Apparel",
            "Other",
          ]}
        />
        <Text value={form.size} onChange={update("size")} name="size" label="Size" placeholder='e.g. "24 × 36" or "3.5 × 2"' />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          value={form.colors}
          onChange={update("colors")}
          name="colors"
          label="Colors"
          options={["1 sided CMYK", "2 sided CMYK", "Spot + CMYK", "Black only"]}
        />
        <Text value={form.material} onChange={update("material")} name="material" label="Stock / Material" placeholder="e.g. 16pt C2S, 13oz Vinyl" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Text
          value={form.finishing}
          onChange={update("finishing")}
          name="finishing"
          label="Coating / Finishing Requirements"
          placeholder="e.g. Matte, Gloss, UV, Grommets"
        />
        <Text value={form.quantity} onChange={update("quantity")} name="quantity" label="Quantity" inputMode="numeric" />
      </div>

      <TextArea value={form.notes} onChange={update("notes")} name="notes" label="Project Notes" placeholder="Tell us anything important for pricing & production." />

      {/* Honeypot (screen-reader hidden too) */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update("website")(e.target.value)} />
        </label>
      </div>

      {msg ? (
        <div
          className={cx(
            "rounded-lg border px-3 py-2 text-sm",
            status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          )}
          role="status"
        >
          {msg}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">Quotes typically returned in 1–2 business days.</p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Request Quote"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------- Custom Order Submission -------------------------- */

function CustomOrderForm() {
  const startedAtRef = useRef<number>(Date.now());

  const [form, setForm] = useState({
    company: "",
    email: "",
    phone: "",
    quoteNumber: "",
    po: "",
    instructions: "",
    expectedDate: "",
    shippingOption: "",
    // anti-spam honeypot
    website: "",
  });

  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  const canSubmit = useMemo(() => {
    if (status === "sending") return false;
    if (!form.company.trim()) return false;
    if (!isEmail(form.email)) return false;
    if (!form.phone.trim()) return false;
    if (!form.quoteNumber.trim()) return false;
    return true;
  }, [form, status]);

  const update = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    setMsg("");

    const payload = {
      ...form,
      startedAtMs: startedAtRef.current,
      submittedAtMs: Date.now(),
    };

    if (!payload.company.trim()) return fail("Please enter your company name.");
    if (!isEmail(payload.email)) return fail("Please enter a valid email.");
    if (!payload.phone.trim()) return fail("Please enter a phone number.");
    if (!payload.quoteNumber.trim()) return fail("Please enter your quote number.");

    setStatus("sending");

    const r = await postJson("/api/quotes/custom-order", payload);
    if (!r.ok) return fail(r.error);

    setStatus("success");
    setMsg("Custom order submitted! We’ll confirm the details by email.");

    setForm({
      company: "",
      email: "",
      phone: "",
      quoteNumber: "",
      po: "",
      instructions: "",
      expectedDate: "",
      shippingOption: "",
      website: "",
    });
    startedAtRef.current = Date.now();
  }

  function fail(m: string) {
    setStatus("error");
    setMsg(m || "Something went wrong. Please try again.");
  }

  return (
    <form className="grid grid-cols-1 gap-4" onSubmit={onSubmit} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Text value={form.company} onChange={update("company")} name="company" label="Company Name *" required />
        <Text value={form.email} onChange={update("email")} name="email" label="Email *" type="email" required />
        <Text value={form.phone} onChange={update("phone")} name="phone" label="Phone *" required />
        <Text value={form.quoteNumber} onChange={update("quoteNumber")} name="quoteNumber" label="Quote Number *" required placeholder="From your approved quote" />
      </div>

      <Text value={form.po} onChange={update("po")} name="po" label="PO (optional)" />

      <TextArea value={form.instructions} onChange={update("instructions")} name="instructions" label="Additional Notes" placeholder="Provide any special instructions for production." />

      <div className="grid gap-3 sm:grid-cols-2">
        <Text value={form.expectedDate} onChange={update("expectedDate")} name="expectedDate" label="Expected Date" type="date" placeholder="YYYY-MM-DD" min={todayIso()} />
        <Select
          value={form.shippingOption}
          onChange={update("shippingOption")}
          name="shippingOption"
          label="Shipping Option"
          options={["Ship for me", "Blind ship to client", "Local pickup"]}
        />
      </div>

      {/* Honeypot */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update("website")(e.target.value)} />
        </label>
      </div>

      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <strong>Heads up:</strong> Custom jobs can vary based on artwork approval and finishing.
        If your timeline is tight, mention a hard deadline and we’ll advise options.
      </div>

      {msg ? (
        <div
          className={cx(
            "rounded-lg border px-3 py-2 text-sm",
            status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          )}
          role="status"
        >
          {msg}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">We’ll confirm details and next steps by email.</p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "sending" ? "Submitting…" : "Submit Custom Order"}
        </button>
      </div>
    </form>
  );
}

/* --------------------------------- Inputs --------------------------------- */

function Text(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, className, ...rest } = props;
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <input
        {...rest}
        className={cx(
          "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
          className
        )}
      />
    </label>
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const { label, className, ...rest } = props;
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <textarea
        {...rest}
        rows={4}
        className={cx(
          "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
          className
        )}
      />
    </label>
  );
}

function Select({
  label,
  options = [],
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options?: string[] } & {
  value?: string;
  onChange?: (v: string) => void;
}) {
  const { value, onChange, ...selectRest } = rest as any;
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <select
        {...selectRest}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        className={cx(
          "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
          className
        )}
      >
        <option value="" />
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
