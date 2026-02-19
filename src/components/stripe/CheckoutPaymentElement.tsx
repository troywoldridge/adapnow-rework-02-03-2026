"use client";

import { useState } from "react";

export type CheckoutPaymentElementProps = {
  clientSecret?: string;
  returnPath?: string;
  submitLabel?: string;
  className?: string;
};

export default function CheckoutPaymentElement({
  returnPath = "/checkout/complete",
  submitLabel = "Continue",
  className = "",
}: CheckoutPaymentElementProps) {
  const [loading, setLoading] = useState(false);

  const onContinue = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/checkout/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data?.url === "string" && data.url) {
        window.location.assign(data.url);
        return;
      }
      window.location.assign(returnPath);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`checkout-pay__wrap ${className}`.trim()}>
      <button type="button" onClick={onContinue} disabled={loading} className="checkout-pay__btn">
        {loading ? "Redirecting…" : submitLabel}
      </button>
    </div>
  );
}
