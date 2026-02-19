"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

export const STRIPE_PK =
  (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();

if (!STRIPE_PK) {
  console.warn("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PK);
  }
  return stripePromise;
}
