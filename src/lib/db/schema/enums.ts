// src/lib/db/schema/enums.ts
// Shared enums for Drizzle schema.
// Add more enums here as you standardize them across tables.

import { pgEnum } from "drizzle-orm/pg-core";

/** Currency codes used in commerce */
export const currencyEnum = pgEnum("currency_code", ["USD", "CAD"]);

/** Order lifecycle status */
export const orderStatus = pgEnum("order_status", [
  "draft",
  "submitted",
  "paid",
  "fulfilled",
  "cancelled",
  "refunded",
]);

/** Loyalty transaction reasons */
export const loyaltyReason = pgEnum("loyalty_reason", [
  "purchase",
  "refund",
  "adjustment",
  "signup",
  "promotion",
]);
