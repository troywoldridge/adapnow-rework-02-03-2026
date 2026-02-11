// src/lib/cartCredits.ts
import "server-only";

import { db } from "@/lib/db";
import { cartCredits } from "@/lib/db/schema/cartCredits";
import { eq, sql } from "drizzle-orm";

/**
 * Sum of all credits (cents) currently applied to a cart.
 * Done in SQL to avoid loading rows into memory.
 */
export async function getCartCreditsCents(cartId: string): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`COALESCE(SUM(${cartCredits.amountCents}), 0)`,
    })
    .from(cartCredits)
    .where(eq(cartCredits.cartId, cartId))
    .limit(1);

  const total = rows[0]?.total ?? 0;
  return Number.isFinite(total) ? total : 0;
}

/**
 * Format cents to a currency string.
 * Note: Intl handles negative values properly (e.g. -$1.00).
 */
export function fmtCurrencyCents(
  cents: number,
  currency: "USD" | "CAD" = "USD",
): string {
  const safe = Number.isFinite(cents) ? cents : 0;

  const locale =
    currency === "CAD"
      ? "en-CA"
      : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(safe / 100);
}
