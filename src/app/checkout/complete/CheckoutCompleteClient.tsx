"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { STRIPE_PK } from "@/lib/stripe-public";

type Status =
  | "Checking payment…"
  | "Stripe not configured."
  | "Missing payment details."
  | "Payment succeeded!"
  | "Your payment is processing."
  | "Payment failed. Try again."
  | "Something went wrong."
  | "Unable to verify payment.";

function safePaymentIntentId(v: string | null): string | null {
  const s = (v || "").trim();
  // Stripe PI ids look like: pi_...
  if (!s) return null;
  if (s.startsWith("pi_") && s.length >= 10) return s;
  return null;
}

export default function CheckoutCompleteClient() {
  const [status, setStatus] = useState<Status>("Checking payment…");

  const params = useMemo(() => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""), []);
  const clientSecret = useMemo(
    () => params.get("payment_intent_client_secret")?.trim() || "",
    [params],
  );
  const intentFromQuery = useMemo(() => safePaymentIntentId(params.get("payment_intent")), [params]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        if (!STRIPE_PK) {
          if (!cancelled) setStatus("Stripe not configured.");
          return;
        }

        const stripe = await loadStripe(STRIPE_PK);
        if (!stripe || !clientSecret) {
          if (!cancelled) setStatus("Missing payment details.");
          return;
        }

        const { paymentIntent, error } = await stripe.retrievePaymentIntent(clientSecret);

        if (cancelled) return;

        if (error) {
          setStatus("Unable to verify payment.");
          return;
        }

        switch (paymentIntent?.status) {
          case "succeeded":
            setStatus("Payment succeeded!");
            break;
          case "processing":
            setStatus("Your payment is processing.");
            break;
          case "requires_payment_method":
            setStatus("Payment failed. Try again.");
            break;
          default:
            setStatus("Something went wrong.");
        }
      } catch {
        if (!cancelled) setStatus("Unable to verify payment.");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clientSecret]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 py-10">
      <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">Checkout status</h1>

        <p className="text-gray-700">{status}</p>

        {intentFromQuery ? (
          <p className="mt-2 text-xs text-gray-500">
            Payment Intent: <span className="font-mono">{intentFromQuery}</span>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <a
            href="/account/orders"
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-900 hover:bg-gray-50"
          >
            View orders
          </a>

          <a
            href="/"
            className="inline-flex rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Continue shopping
          </a>

          <a
            href="/cart/review"
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-900 hover:bg-gray-50"
          >
            Back to cart
          </a>
        </div>
      </div>
    </main>
  );
}
