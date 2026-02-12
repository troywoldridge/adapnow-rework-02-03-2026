import "server-only";

import Stripe from "stripe";

import { getEnv, requireStripeKey } from "@/lib/env";

/**
 * Server-side Stripe SDK instance.
 * Use ONLY in Node.js runtime route handlers / server code.
 *
 * Env:
 *   - STRIPE_SECRET_KEY  (preferred)
 *   - STRIPE_API_KEY     (legacy fallback)
 *   - STRIPE_API_VERSION (optional override)
 */

const STRIPE_KEY = requireStripeKey();

const apiVersion =
  (getEnv().STRIPE_API_VERSION as Stripe.StripeConfig["apiVersion"]) ??
  ("2025-07-30.basil" as Stripe.StripeConfig["apiVersion"]);

export const stripe = new Stripe(STRIPE_KEY, {
  apiVersion,
  maxNetworkRetries: 2,
  timeout: 60_000,
  appInfo: { name: "ADAP", version: "1.0.0" },
});

export type { Stripe };
export default stripe;
