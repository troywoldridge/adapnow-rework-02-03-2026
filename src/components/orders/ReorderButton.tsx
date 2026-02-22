"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  orderId: string;
  className?: string;
  children?: React.ReactNode;
};

export default function ReorderButton({ orderId, className, children }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  async function onClick() {
    if (!orderId || busy) return;
    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/reorder`, {
        method: "POST",
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      // Typed response shape from the reorder API
      type ReorderResponse = {
        ok?: boolean;
        error?: string;
        detail?: string;
        redirect?: string;
      } | null;

      const json = (await res.json().catch(() => null)) as ReorderResponse;

      if (!res.ok || !json?.ok) {
        const msg =
          json?.error === "no_items_to_reorder"
            ? "That order has no items to reorder."
            : json?.error === "not_found"
            ? "Order not found."
            : json?.detail || json?.error || "Reorder failed.";
        setError(String(msg));
        return;
      }

      // Prefer API-provided redirect; otherwise go to cart
      const to = typeof json.redirect === "string" && json.redirect ? json.redirect : "/cart";
      router.push(to);
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Reorder failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? "Reordering…" : children ?? "Reorder"}
      </button>

      {error ? (
        <div className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
