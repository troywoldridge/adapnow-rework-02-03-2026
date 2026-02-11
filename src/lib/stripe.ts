import "server-only";

import Stripe from "stripe";

/**
 * Server-side Stripe SDK instance.
 * Use ONLY in Node.js runtime route handlers / server code.
 *
 * Env:
 *   - STRIPE_SECRET_KEY  (preferred)
 *   - STRIPE_API_KEY     (legacy fallback)
 *   - STRIPE_API_VERSION (optional override)
 */

const STRIPE_KEY = (process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY ?? "").trim();
if (!STRIPE_KEY) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY (or STRIPE_API_KEY). Set it in your env before starting the server.",
  );
}

// If provided, must match Stripe's expected apiVersion string.
// If unset, we pin to a known version (same as your routes).
const apiVersion =
  (process.env.STRIPE_API_VERSION?.trim() as Stripe.StripeConfig["apiVersion"]) ??
  ("2025-07-30.basil" as Stripe.StripeConfig["apiVersion"]);

export const stripe = new Stripe(STRIPE_KEY, {
  apiVersion,
  maxNetworkRetries: 2,
  timeout: 60_000,
  appInfo: { name: "ADAP", version: "1.0.0" },
});

export type { Stripe };
export default stripe;
