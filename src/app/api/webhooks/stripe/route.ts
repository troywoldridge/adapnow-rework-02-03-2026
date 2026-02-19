// src/app/api/webhooks/stripe/route.ts
import "server-only";

// Thin wrapper to prevent duplicate webhook logic drift.
// Canonical implementation lives at:
//   src/app/api/stripe/webhook/route.ts
//
// Keep this route path for consistency with other webhooks (/api/webhooks/*),
// but ensure there is a single source of truth.

export { runtime, dynamic, revalidate, POST } from "@/app/api/stripe/webhook/route";
