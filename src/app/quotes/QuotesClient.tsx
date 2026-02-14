"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Tab = "quote" | "custom";

type QuotePayload = {
  kind: "quote";
  name: string;
  company?: string;
  email: string;
  phone?: string;

  productType: string;
  size?: string;
  colors?: string;
  material?: string;
  finishing?: string;
  quantity?: string;

  notes?: string;
};

type CustomOrderPayload = {
  kind: "custom";
  company: string;
  email: string;
  phone: string;

  quoteNumber: string;
  po?: string;

  instructions?: string;
  expectedDate?: string;
  shippingOption?: string;

  // Later: you can store upload references here (R2 keys, URLs, etc.)
  artworkNote?: string;
};

function cx(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
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
        "w-full rounded-lg px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-blue-700 text-white shadow"
          : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 ring-1 ring-inset ring-blue-200">
      {children}
    </span>
  );
}

function InlineNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function formatTodayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function QuotesClient() {
  const [tab, setTab] = useState<Tab>("quote");
  const [sent, setSent] = useState<null | { title: string; msg: string }>(null);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-5">
          {/* Left */}
          <div className="p-6 lg:col-span-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Fast quotes</Badge>
              <Badge>Production-ready</Badge>
              <Badge>Real humans</Badge>
            </div>

            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Custom Quotes & Orders
            </h1>

            <p className="mt-2 text-slate-600">
              Tell us what you need — we’ll price it fast and keep it aligned with production specs.
              If it’s unusual, no problem: we’ll guide you to the closest match and best timeline.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <TabButton active={tab === "quote"} onClick={() => setTab("quote")}>
                Quote Request
              </TabButton>
              <TabButton active={tab === "custom"} onClick={() => setTab("custom")}>
                Submit Custom Order
              </TabButton>
            </div>

            <div className="mt-5">
              {sent ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                  <div className="font-semibold">{sent.title}</div>
                  <p className="mt-1 text-sm">{sent.msg}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSent(null)}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      Submit another
                    </button>
                    <Link
                      href="/guides"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                    >
                      View artwork guides
                    </Link>
                  </div>
                </div>
              ) : tab === "quote" ? (
                <QuoteForm
                  onSuccess={() =>
                    setSent({
                      title: "Quote request received!",
                      msg: "We’ll review it and email you pricing. Typical response: 1–2 business days.",
                    })
                  }
                />
              ) : (
                <CustomOrderForm
                  onSuccess={() =>
                    setSent({
                      title: "Custom order submitted!",
                      msg: "We’ll confirm details and next steps by email.",
                    })
                  }
                />
              )}
            </div>
          </div>

          {/* Right */}
          <aside className="border-t border-slate-200 bg-slate-50 p-6 lg:col-span-2 lg:border-l lg:border-t-0">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
              What you get
            </h2>

            <ul className="mt-3 space-y-3 text-sm text-slate-700">
              <li className="flex gap-2">
                <span aria-hidden>✅</span>
                <span>
                  <b>Accurate pricing</b> based on real production options (stock, coating, finish).
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden>✅</span>
                <span>
                  <b>File guidance</b> so your artwork prints clean — no surprises.
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden>✅</span>
                <span>
                  <b>Timeline clarity</b> (production + shipping) before you commit.
                </span>
              </li>
            </ul>

            <div className="mt-5 rounded-xl border border-blue-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Helpful links</div>
              <div className="mt-2 flex flex-col gap-2 text-sm">
                <Link className="text-blue-700 hover:underline" href="/guides">
                  Artwork Setup Guides (PDF)
                </Link>
                <Link className="text-blue-700 hover:underline" href="/shipping">
                  Shipping Options
                </Link>
                <Link className="text-blue-700 hover:underline" href="/turnaround">
                  Turnaround Times
                </Link>
                <Link className="text-blue-700 hover:underline" href="/guarantees">
                  Our Guarantees
                </Link>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <b>Tip:</b> If you have a hard deadline, put it in the notes — we’ll suggest the
              best option to hit it.
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

/* ----------------------------- Quote Request ----------------------------- */

function QuoteForm({ onSuccess }: { onSuccess: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<QuotePayload>({
    kind: "quote",
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
  });

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false;
    if (!validateEmail(form.email)) return false;
    if (!form.productType.trim()) return false;
    return true;
  }, [form]);

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      // You don't have the API yet — so we simulate success.
      // Later you'll replace this with:
      // await fetch("/api/quotes", { method:"POST", headers:{...}, body: JSON.stringify(form) })
      await new Promise((r) => setTimeout(r, 600));

      onSuccess();
    } catch (e: any) {
      setError(e?.message || "Failed to submit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid grid-cols-1 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || busy) return;
        submit();
      }}
    >
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Text
          label="Name *"
          value={form.name}
          onChange={(v) => setForm((p) => ({ ...p, name: v }))}
        />
        <Text
          label="Company"
          value={form.company || ""}
          onChange={(v) => setForm((p) => ({ ...p, company: v }))}
        />
        <Text
          label="Email *"
          value={form.email}
          onChange={(v) => setForm((p) => ({ ...p, email: v }))}
          inputMode="email"
        />
        <Text
          label="Phone"
          value={form.phone || ""}
          onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Type of Product *"
          value={form.productType}
          onChange={(v) => setForm((p) => ({ ...p, productType: v }))}
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
        <Text
          label="Size"
          value={form.size || ""}
          onChange={(v) => setForm((p) => ({ ...p, size: v }))}
          placeholder='e.g. "24 × 36" or "3.5 × 2"'
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Colors"
          value={form.colors || ""}
          onChange={(v) => setForm((p) => ({ ...p, colors: v }))}
          options={["1 sided CMYK", "2 sided CMYK", "Spot + CMYK", "Black only"]}
        />
        <Text
          label="Stock / Material"
          value={form.material || ""}
          onChange={(v) => setForm((p) => ({ ...p, material: v }))}
          placeholder="e.g. 16pt C2S, 13oz Vinyl"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Text
          label="Coating / Finishing"
          value={form.finishing || ""}
          onChange={(v) => setForm((p) => ({ ...p, finishing: v }))}
          placeholder="e.g. Matte, Gloss, UV, Grommets"
        />
        <Text
          label="Quantity"
          value={form.quantity || ""}
          onChange={(v) => setForm((p) => ({ ...p, quantity: v }))}
          inputMode="numeric"
        />
      </div>

      <TextArea
        label="Project Notes"
        value={form.notes || ""}
        onChange={(v) => setForm((p) => ({ ...p, notes: v }))}
        placeholder="Tell us anything important for pricing & production."
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <InlineNote>
          Quotes typically returned in <b>1–2 business days</b>.
        </InlineNote>

        <button
          type="submit"
          disabled={!canSubmit || busy}
          className={cx(
            "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold shadow",
            !canSubmit || busy
              ? "bg-slate-200 text-slate-500 cursor-not-allowed"
              : "bg-blue-700 text-white hover:bg-blue-800"
          )}
        >
          {busy ? "Sending…" : "Request Quote"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------- Custom Order Submission -------------------------- */

function CustomOrderForm({ onSuccess }: { onSuccess: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CustomOrderPayload>({
    kind: "custom",
    company: "",
    email: "",
    phone: "",
    quoteNumber: "",
    po: "",
    instructions: "",
    expectedDate: "",
    shippingOption: "",
    artworkNote: "",
  });

  const canSubmit = useMemo(() => {
    if (!form.company.trim()) return false;
    if (!validateEmail(form.email)) return false;
    if (!form.phone.trim()) return false;
    if (!form.quoteNumber.trim()) return false;
    return true;
  }, [form]);

  const today = formatTodayIso();

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      // You don't have the API yet — simulate success.
      // Later replace with:
      // await fetch("/api/custom-orders", {...})
      await new Promise((r) => setTimeout(r, 700));
      onSuccess();
    } catch (e: any) {
      setError(e?.message || "Failed to submit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid grid-cols-1 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || busy) return;
        submit();
      }}
    >
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Text
          label="Company Name *"
          value={form.company}
          onChange={(v) => setForm((p) => ({ ...p, company: v }))}
        />
        <Text
          label="Email *"
          value={form.email}
          onChange={(v) => setForm((p) => ({ ...p, email: v }))}
          inputMode="email"
        />
        <Text
          label="Phone *"
          value={form.phone}
          onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
        />
        <Text
          label="Quote Number *"
          value={form.quoteNumber}
          onChange={(v) => setForm((p) => ({ ...p, quoteNumber: v }))}
          placeholder="From your approved quote"
        />
      </div>

      <Text
        label="PO (optional)"
        value={form.po || ""}
        onChange={(v) => setForm((p) => ({ ...p, po: v }))}
      />

      <TextArea
        label="Additional Notes"
        value={form.instructions || ""}
        onChange={(v) => setForm((p) => ({ ...p, instructions: v }))}
        placeholder="Provide any special instructions for production."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Text
          label="Expected Date"
          value={form.expectedDate || ""}
          onChange={(v) => setForm((p) => ({ ...p, expectedDate: v }))}
          placeholder={today}
        />
        <Select
          label="Shipping Option"
          value={form.shippingOption || ""}
          onChange={(v) => setForm((p) => ({ ...p, shippingOption: v }))}
          options={["Ship for me", "Blind ship to client", "Local pickup"]}
        />
      </div>

      {/* File placeholder (real uploader later) */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-semibold text-slate-900">Artwork upload</div>
        <p className="mt-1 text-xs text-slate-600">
          You’ll be able to upload files here once the order flow + storage endpoints are in place.
        </p>
        <Text
          label="Artwork note (optional)"
          value={form.artworkNote || ""}
          onChange={(v) => setForm((p) => ({ ...p, artworkNote: v }))}
          placeholder="e.g. “Will upload after approval”"
        />
      </div>

      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <b>Heads up:</b> Custom jobs can vary based on artwork approval and finishing. If your
        timeline is tight, mention the hard deadline above and we’ll advise options.
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <InlineNote>
          Once submitted, we’ll confirm details and next steps by email.
        </InlineNote>

        <button
          type="submit"
          disabled={!canSubmit || busy}
          className={cx(
            "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold shadow",
            !canSubmit || busy
              ? "bg-slate-200 text-slate-500 cursor-not-allowed"
              : "bg-blue-700 text-white hover:bg-blue-800"
          )}
        >
          {busy ? "Submitting…" : "Submit Custom Order"}
        </button>
      </div>
    </form>
  );
}

/* --------------------------------- Inputs --------------------------------- */

function Text({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-blue-200 focus:border-blue-600 focus:ring"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none ring-blue-200 focus:border-blue-600 focus:ring"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-200 focus:border-blue-600 focus:ring"
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
