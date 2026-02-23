// src/app/account/orders/[id]/invoice/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrderRow = typeof orders.$inferSelect;

function cleanId(s: unknown): string {
  return String(s ?? "").trim();
}

function clampStr(s: unknown, max = 80): string {
  const v = String(s ?? "").trim();
  if (!v) return "";
  return v.length <= max ? v : v.slice(0, max - 1) + "…";
}

function niceDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function moneyFmt(cents: number, currency: "USD" | "CAD") {
  const dollars = (Number(cents) || 0) / 100;
  const locale = currency === "CAD" ? "en-CA" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(dollars);
}

/* ------------------------------ SEO (PRIVATE PAGE) ------------------------------ */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Invoice | American Design And Printing",
    description: "View and download your invoice PDF.",
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
        "max-image-preview": "none",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

/* ------------------------------ loader ------------------------------ */
async function loadOrderOrNull(orderIdRaw: string): Promise<OrderRow | null> {
  const orderId = cleanId(orderIdRaw);
  if (!orderId) return null;

  const { userId } = await auth();

  // In some Next builds, cookies() is Promise<ReadonlyRequestCookies>
  const jar = await cookies();
  const sid = jar.get("adap_sid")?.value ?? jar.get("sid")?.value ?? null;

  const o =
    ((await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))?.[0] as
      | OrderRow
      | undefined) ?? null;

  if (!o) return null;

  const owner = String((o as any).userId ?? "");

  // Guest → user claim
  if (userId && sid && owner === String(sid)) {
    await db.update(orders).set({ userId }).where(eq(orders.id, orderId));
    (o as any).userId = userId;
  }

  // Ownership check
  const updatedOwner = String((o as any).userId ?? "");
  const claimants = [userId, sid].filter(Boolean).map(String);

  if (!claimants.includes(updatedOwner)) return null;

  return o;
}

/* ------------------------------ page ------------------------------ */
export default async function InvoicePage({
  params,
}: {
  /**
   * IMPORTANT:
   * Your build's PageProps constraint expects params to be Promise-like:
   *   params?: Promise<any>
   * So do NOT union with `{ id: string }` here.
   */
  params: Promise<{ id: string }>;
}) {
  // Works whether Next passes a Promise OR (at runtime) a plain object,
  // but we type it as Promise-only to satisfy the build constraint.
  const resolvedParams = await (params as unknown as Promise<{ id: string }>);
  const orderId = cleanId(resolvedParams?.id);
  if (!orderId) notFound();

  const o = await loadOrderOrNull(orderId);
  if (!o) notFound();

  const currency = ((o as any).currency === "CAD" ? "CAD" : "USD") as "USD" | "CAD";
  const placedAt = (o as any).placedAt ?? (o as any).createdAt ?? null;

  const orderNumber = (o as any).orderNumber ? String((o as any).orderNumber) : null;
  const status = clampStr((o as any).status || "placed", 40);

  const subtotal = Number((o as any).subtotalCents) || 0;
  const ship = Number((o as any).shippingCents) || 0;
  const tax = Number((o as any).taxCents) || 0;
  const credits = Number((o as any).creditsCents ?? 0);
  const total = Number((o as any).totalCents) || 0;

  // PDF endpoint this page expects
  const pdfPath = `/api/orders/${encodeURIComponent(orderId)}/invoice`;
  const pdfEmbedUrl = `${pdfPath}#view=FitH&toolbar=1&navpanes=0`;
  const headerTitle = orderNumber ? `Invoice — Order #${orderNumber}` : `Invoice — Order ${orderId.slice(0, 8)}`;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      {/* Header */}
      <header className="rounded-3xl border bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-gray-900">{headerTitle}</h1>
            <p className="mt-1 text-sm text-gray-600">
              Placed {niceDate(String(placedAt || ""))} •{" "}
              <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200">
                {status}
              </span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/account/orders/${encodeURIComponent(orderId)}`}
              className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-800 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
            >
              Back to order
            </Link>

            <a
              href={pdfPath}
              className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Download PDF
            </a>

            <a
              href={pdfPath}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50"
            >
              Open in new tab
            </a>

            <form
              action={`/account/orders/${encodeURIComponent(orderId)}/invoice/email`}
              method="post"
              className="print:hidden"
            >
              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-800 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
              >
                Email me this invoice
              </button>
            </form>
          </div>
        </div>

        {/* Quick totals */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600">Subtotal</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">{moneyFmt(subtotal, currency)}</div>
          </div>
          <div className="rounded-2xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600">Shipping</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">{moneyFmt(ship, currency)}</div>
          </div>
          <div className="rounded-2xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600">Tax</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">{moneyFmt(tax, currency)}</div>
          </div>
          <div className="rounded-2xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600">Credits</div>
            <div className={`mt-1 text-sm font-extrabold ${credits > 0 ? "text-emerald-700" : "text-slate-900"}`}>
              {credits > 0 ? `−${moneyFmt(credits, currency)}` : moneyFmt(0, currency)}
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-3 ring-1 ring-black/5">
            <div className="text-xs font-semibold text-slate-600">Total</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">{moneyFmt(total, currency)}</div>
          </div>
        </div>
      </header>

      {/* PDF viewer */}
      <section className="mt-6 overflow-hidden rounded-3xl border bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">Invoice PDF</div>
          <div className="text-xs text-slate-600">
            If the viewer doesn’t load,{" "}
            <a href={pdfPath} className="font-semibold text-indigo-700 hover:underline">
              download the PDF
            </a>
            .
          </div>
        </div>

        <div className="h-[80vh] w-full">
          <iframe title="Invoice PDF" src={pdfEmbedUrl} className="h-full w-full" />
        </div>
      </section>

      {/* Footer note */}
      <p className="mt-4 text-xs text-gray-500">
        For your privacy, this page isn’t indexed by search engines. If you need help,{" "}
        <Link href="/contact" className="font-semibold text-indigo-700 hover:underline">
          contact support
        </Link>
        .
      </p>
    </main>
  );
}
