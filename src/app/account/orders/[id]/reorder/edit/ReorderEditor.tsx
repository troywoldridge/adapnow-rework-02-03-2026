// src/app/account/orders/[id]/reorder/edit/ReorderEditor.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Line = { productId: number; quantity: number; unitPriceCents?: number | null };

type ReorderResponse =
  | { ok: true; goto?: string }
  | { ok: false; error?: string };

function clampInt(n: unknown, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  const v = Math.floor(x);
  return Math.min(max, Math.max(min, v));
}

function currencyLocale(currency: "USD" | "CAD") {
  return currency === "CAD" ? "en-CA" : "en-US";
}

function fmtMoney(currency: "USD" | "CAD", cents?: number | null) {
  const dollars = (Number(cents || 0) || 0) / 100;
  return new Intl.NumberFormat(currencyLocale(currency), {
    style: "currency",
    currency,
  }).format(dollars);
}

function sanitizeLines(lines: Line[]) {
  // Keep only valid productId, clamp qty; allow qty 0 (means remove)
  const out: Line[] = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    const pid = Number(l?.productId);
    if (!Number.isFinite(pid) || pid <= 0) continue;

    const qty = clampInt(l?.quantity, 0, 1_000_000);
    out.push({
      productId: pid,
      quantity: qty,
      unitPriceCents: l?.unitPriceCents ?? null,
    });
  }
  return out;
}

export default function ReorderEditor(props: {
  orderId: string;
  currency: "USD" | "CAD";
  lines: Line[];

  /**
   * Optional enhancement for "ultimate max" display:
   * pass a map like { [productId]: { name, sku } } from the server page later.
   * If omitted, we fall back to "Product {id}".
   */
  productMeta?: Record<number, { name?: string | null; sku?: string | null }>;
}) {
  const router = useRouter();

  const [rows, setRows] = React.useState<Line[]>(() => sanitizeLines(props.lines));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const locale = currencyLocale(props.currency);

  const onQtyChange = (idx: number, next: number) => {
    const q = clampInt(next, 0, 1_000_000);
    setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: q } : x)));
  };

  const inc = (idx: number, delta: number) => {
    setRows((prev) =>
      prev.map((x, i) =>
        i === idx ? { ...x, quantity: clampInt((x.quantity ?? 0) + delta, 0, 1_000_000) } : x
      )
    );
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: 0 } : x)));
  };

  const hasAny = rows.some((r) => (r.quantity ?? 0) > 0);

  const submit = async () => {
    try {
      setError(null);
      setSaving(true);

      const payloadLines = sanitizeLines(rows).filter((l) => l.quantity > 0);

      if (!payloadLines.length) {
        setError("Please keep at least one item with quantity greater than 0.");
        return;
      }

      // NOTE: This endpoint path is intentionally left as-is to match your existing API.
      // If you later consolidate routes, update this string.
      const res = await fetch(`/api/orders/${encodeURIComponent(props.orderId)}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lines: payloadLines }),
      });

      let data: ReorderResponse | null = null;
      try {
        data = (await res.json()) as ReorderResponse;
      } catch {
        data = null;
      }

      if (!res.ok || !data || !data.ok) {
        const msg =
          (!res.ok ? `Request failed (HTTP ${res.status}).` : "") ||
          (data && "error" in data && data.error ? String(data.error) : "") ||
          "Failed to reorder.";
        throw new Error(msg);
      }

      router.push(data.goto ?? "/cart/review");
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to reorder.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Reorder — adjust quantities</h1>
        <p className="mt-1 text-sm text-gray-600">
          Update quantities below, then add the items to your cart.
        </p>
      </header>

      {error && (
        <div
          className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
          aria-live="polite"
        >
          <div className="font-semibold">Couldn’t add to cart</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b bg-gray-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Items
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Product
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Quantity
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Unit
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Line total
                </th>
                <th className="px-4 py-3" aria-hidden="true" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => {
                const meta = props.productMeta?.[r.productId];
                const name =
                  (meta?.name && String(meta.name).trim()) || `Product ${r.productId}`;
                const sku =
                  meta?.sku && String(meta.sku).trim() ? String(meta.sku).trim() : null;

                const qty = clampInt(r.quantity ?? 0, 0, 1_000_000);
                const unit = Number(r.unitPriceCents ?? 0) || 0;
                const line = unit * qty;

                return (
                  <tr key={`${r.productId}-${i}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{name}</div>
                      {sku ? <div className="mt-0.5 text-xs text-gray-500">SKU: {sku}</div> : null}
                      <div className="mt-0.5 text-xs text-gray-500">ID: {r.productId}</div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => inc(i, -1)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
                          disabled={saving || qty <= 0}
                          aria-label={`Decrease quantity for ${name}`}
                        >
                          −
                        </button>

                        <label className="sr-only" htmlFor={`qty-${i}`}>
                          Quantity for {name}
                        </label>
                        <input
                          id={`qty-${i}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={qty}
                          onChange={(e) => onQtyChange(i, e.currentTarget.value)}
                          disabled={saving}
                          className="w-24 rounded-lg border px-2 py-2 text-sm"
                        />

                        <button
                          type="button"
                          onClick={() => inc(i, +1)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
                          disabled={saving}
                          aria-label={`Increase quantity for ${name}`}
                        >
                          +
                        </button>
                      </div>

                      {qty === 0 ? (
                        <div className="mt-1 text-xs text-rose-700">
                          This item will not be added.
                        </div>
                      ) : null}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {fmtMoney(props.currency, unit)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-900">
                      {fmtMoney(props.currency, line)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        disabled={saving || qty === 0}
                        className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-800 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!rows.length ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-gray-600" colSpan={5}>
                    No reorderable items were found for this order.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="border-t bg-gray-50 px-4 py-3 text-xs text-gray-600">
          Currency: <span className="font-semibold text-gray-900">{props.currency}</span> • Locale:{" "}
          <span className="font-semibold text-gray-900">{locale}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => history.back()}
          disabled={saving}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-800 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 disabled:opacity-60"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !hasAny}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add to cart"}
        </button>
      </div>
    </main>
  );
}
