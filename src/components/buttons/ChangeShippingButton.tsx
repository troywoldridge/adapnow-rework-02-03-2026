"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function ChangeShippingButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Avoid setting state after unmount + allow abort on unmount
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  async function onClick() {
    if (busy) return;

    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/cart/clear-shipping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ac.signal,
      });

      // Be resilient if API returns non-JSON on error
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        const msg =
          json?.error ||
          json?.message ||
          (text && text.length < 200 ? text : null) ||
          `Request failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      // Refresh current route data (server components)
      router.refresh();
    } catch (e: any) {
      // Ignore abort errors (navigation/unmount)
      if (e?.name === "AbortError") return;

      console.error("[ChangeShippingButton] Failed to clear shipping:", e);

      // Optional: hook up to your toast system later
      // toast.error(e?.message ?? "Failed to update shipping");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="btn btn-secondary btn-sm"
      aria-busy={busy}
    >
      {busy ? "Updating…" : "Change"}
    </button>
  );
}
