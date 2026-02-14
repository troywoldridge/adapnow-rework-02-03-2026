"use client";

import { useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { stripePromise } from "@/lib/stripe-public";

export type CheckoutPaymentElementProps = {
  clientSecret: string;
  /**
   * Where Stripe should redirect after confirmation (server verifies payment).
   * Default: /checkout/complete
   */
  returnPath?: string;

  /**
   * Button label (default: "Pay now")
   */
  submitLabel?: string;

  className?: string;
};

function safeOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin || "";
}

function InnerForm(props: {
  returnUrl: string;
  submitLabel: string;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripe || !elements || loading) return;

    setLoading(true);
    setMessage(null);

    try {
      // PaymentElement can require extra confirmation steps (3DS), so Stripe may redirect.
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: props.returnUrl },
        redirect: "if_required",
      });

      if (error) {
        setMessage(error.message || "Payment failed. Please try again.");
        setLoading(false);
        return;
      }

      // If no redirect happened, payment may already be confirmed.
      // We still send the user to the completion page to finalize server-side.
      window.location.assign(props.returnUrl);
    } catch (err: any) {
      setMessage(err?.message || "Payment failed. Please try again.");
      setLoading(false);
    }
  };

  const disabled = !stripe || !elements || loading;

  return (
    <form onSubmit={onSubmit} className="checkout-pay" aria-busy={loading}>
      <div className="checkout-pay__element">
        <PaymentElement options={{ layout: "accordion" }} />
      </div>

      <button type="submit" disabled={disabled} className="checkout-pay__btn">
        {loading ? "Processing…" : props.submitLabel}
      </button>

      {message ? (
        <p className="checkout-pay__error" role="alert" aria-live="polite">
          {message}
        </p>
      ) : (
        <p className="checkout-pay__hint" aria-live="polite">
          Payments are processed securely by Stripe.
        </p>
      )}
    </form>
  );
}

export default function CheckoutPaymentElement({
  clientSecret,
  returnPath = "/checkout/complete",
  submitLabel = "Pay now",
  className = "",
}: CheckoutPaymentElementProps) {
  // NOTE: avoid relying on env at runtime here; in Next, NEXT_PUBLIC_* is compiled.
  // If stripePromise exists, publishable key is configured; otherwise show a clean fallback.
  if (!clientSecret) {
    return <div className="checkout-pay__status">Preparing secure payment…</div>;
  }

  const returnUrl = useMemo(() => {
    const origin = safeOrigin();
    const path = String(returnPath || "/checkout/complete").trim() || "/checkout/complete";
    if (!origin) return path; // best effort; Stripe really needs absolute on client
    return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  }, [returnPath]);

  const options: StripeElementsOptions = useMemo(
    () => ({
      clientSecret,
      appearance: { theme: "stripe" },
    }),
    [clientSecret]
  );

  return (
    <div className={`checkout-pay__wrap ${className}`.trim()}>
      <Elements stripe={stripePromise} options={options}>
        <InnerForm returnUrl={returnUrl} submitLabel={submitLabel} />
      </Elements>
    </div>
  );
}
