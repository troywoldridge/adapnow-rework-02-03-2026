"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

export const STRIPE_PK = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();

if (!STRIPE_PK && process.env.NODE_ENV !== "production") {
  console.warn("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
}

export const stripePromise: Promise<Stripe | null> = STRIPE_PK
  ? loadStripe(STRIPE_PK)
  : Promise.resolve(null);

export function getStripe(): Promise<Stripe | null> {
  return stripePromise;
}
