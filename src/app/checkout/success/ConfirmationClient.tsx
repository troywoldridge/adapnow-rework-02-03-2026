"use client";

import * as React from "react";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

function safeTrim(v: string | null): string {
  return (v || "").trim();
}

function isProbablySafeId(v: string): boolean {
  // Permissive enough for Stripe ids / UUIDs / numeric ids,
  // but avoids rendering huge garbage or weird characters.
  if (!v) return false;
  if (v.length > 200) return false;
  return /^[a-zA-Z0-9._:\-]+$/.test(v);
}

export default function ConfirmationClient() {
  const sp = useSearchParams();

  const { sessionId, orderId } = useMemo(() => {
    const s = safeTrim(sp.get("session_id")) || safeTrim(sp.get("sessionId"));
    const o = safeTrim(sp.get("order_id")) || safeTrim(sp.get("orderId"));

    return {
      sessionId: isProbablySafeId(s) ? s : "",
      orderId: isProbablySafeId(o) ? o : "",
    };
  }, [sp]);

  if (!sessionId && !orderId) return null;

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Confirmation details</h2>

      <dl className="mt-3 space-y-2 text-sm">
        {orderId ? (
          <div className="flex gap-3">
            <dt className="w-28 text-slate-500">Order ID</dt>
            <dd className="font-mono text-slate-900">{orderId}</dd>
          </div>
        ) : null}

        {sessionId ? (
          <div className="flex gap-3">
            <dt className="w-28 text-slate-500">Session</dt>
            <dd className="font-mono text-slate-900">{sessionId}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
