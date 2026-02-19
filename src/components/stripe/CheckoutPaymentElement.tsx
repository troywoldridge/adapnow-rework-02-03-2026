"use client";

import { useCallback, useEffect, useState } from "react";

export type CheckoutPaymentElementProps = {
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
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  const initializeCheckout = useCallback(async () => {
    setIsInitializing(true);
    setInitializationError(null);
    try {
      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data?.clientSecret !== "string" || !data.clientSecret) {
        throw new Error("Unable to start checkout right now. Please try again.");
      }
    } catch (error) {
      console.error("Failed to initialize checkout payment intent", error);
      setInitializationError(
        error instanceof Error
          ? error.message
          : "Unable to start checkout right now. Please try again.",
      );
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    void initializeCheckout();
  }, [initializeCheckout]);

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

  if (isInitializing) {
    return (
      <div className="w-full rounded-xl border bg-white p-6 text-sm text-gray-600">
        Starting checkout…
      </div>
    );
  }

  if (initializationError) {
    return (
      <div className="w-full rounded-xl border bg-white p-6 text-sm text-red-600">
        {initializationError}
        <button
          type="button"
          onClick={() => void initializeCheckout()}
          className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={`checkout-pay__wrap ${className}`.trim()}>
      <button type="button" onClick={onContinue} disabled={loading} className="checkout-pay__btn">
        {loading ? "Redirecting…" : submitLabel}
      </button>
    </div>
  );
}
