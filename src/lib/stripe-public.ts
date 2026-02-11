"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

const PK = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();

if (!PK && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line no-console
  console.warn("[stripe] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing");
}

let cached: Promise<Stripe | null> | null = null;

/**
 * Client-side Stripe.js loader (cached).
 * Returns null when publishable key is missing (caller can handle gracefully).
 */
export function getStripe(): Promise<Stripe | null> {
  if (cached) return cached;
  cached = PK ? loadStripe(PK) : Promise.resolve(null);
  return cached;
}

// Back-compat export
export const stripePromise: Promise<Stripe | null> = getStripe();
