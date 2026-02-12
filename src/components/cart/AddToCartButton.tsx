"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = {
  productId: number;
  optionIds: number[]; // MUST include the SinaLite qty valueId (per docs)
  quantity: number; // UI quantity; server pricing uses the qty optionId
  store: "US" | "CA";
  label?: string;
  className?: string;
  onAdded?: (lineId: string) => void;
};

type AddToCartResponse =
  | { ok: true; lineId: string }
  | { ok: false; error?: string; message?: string; details?: unknown };

function defaultClassName() {
  return "inline-flex h-11 items-center justify-center rounded-lg bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-50";
}

async function safeReadJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function AddToCartButton({
  productId,
  optionIds,
  quantity,
  store,
  label = "Add & Upload Artwork",
  className,
  onAdded,
}: Props) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const handleClick = async () => {
    if (busy) return;

    // Basic sanity checks (don’t block if you prefer silent fail, but these help catch UI bugs fast)
    if (!Number.isFinite(productId) || productId <= 0) {
      console.error("AddToCartButton: invalid productId", { productId });
      return;
    }
    if (!Array.isArray(optionIds) || optionIds.length === 0) {
      console.error("AddToCartButton: optionIds required", { optionIds });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      console.error("AddToCartButton: invalid quantity", { quantity });
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      setBusy(true);

      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, optionIds, quantity, store }),
        signal: ctrl.signal,
      });

      const json = (await safeReadJson(res)) as AddToCartResponse | null;

      if (!res.ok || !json?.ok) {
        console.error("Add to cart failed:", {
          status: res.status,
          statusText: res.statusText,
          body: json,
        });
        return;
      }

      const lineId = json.lineId;
      if (onAdded) onAdded(lineId);

      // Redirect to the upload step BEFORE cart (as requested)
      const qs = new URLSearchParams({ lineId });
      r.push(`/product/${productId}/upload-artwork?${qs.toString()}`);
    } catch (err) {
      // Abort is normal during navigation/unmount
      if ((err as any)?.name === "AbortError") return;
      console.error("Add to cart error:", err);
    } finally {
      abortRef.current = null;
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      aria-disabled={busy}
      aria-busy={busy}
      className={className ?? defaultClassName()}
      onClick={handleClick}
    >
      {busy ? "Adding…" : label}
    </button>
  );
}
