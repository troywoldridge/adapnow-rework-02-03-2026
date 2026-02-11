// src/lib/loyalty.ts
// Centralized loyalty math + config.
// Keep accrual/redemption rules aligned with your business rules:
// - Award points only after an order reaches a final billable state.
// - Redeem points into store credits in a consistent, predictable way.

export type LoyaltyTier = "Bronze" | "Silver" | "Gold" | "Platinum";

export const LOYALTY = {
  // EARN: points per 1 unit of currency (USD/CAD)
  EARN_POINTS_PER_DOLLAR: {
    USD: 10,
    CAD: 10,
  },

  // REDEEM: points required for $1 store credit (100 pts = $1.00)
  REDEEM_POINTS_PER_DOLLAR: 100,

  // Min redemption and increment step (multiples of 100 recommended)
  REDEEM_MIN_POINTS: 100,
  REDEEM_INCREMENT: 100,
} as const;

const TIERS: Array<{ name: LoyaltyTier; min: number; next?: number }> = [
  { name: "Bronze", min: 0, next: 1000 },
  { name: "Silver", min: 1000, next: 5000 },
  { name: "Gold", min: 5000, next: 20000 },
  { name: "Platinum", min: 20000 },
];

export type LoyaltyUiSnapshot = {
  balance: number;
  points: number; // alias for UI
  tier: LoyaltyTier;
  /**
   * Points remaining until next tier.
   * null if already at top tier.
   */
  nextTierAt: number | null;
};

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function computeLoyalty(pointsBalance: number): LoyaltyUiSnapshot {
  const bal = Math.max(0, toInt(pointsBalance, 0));
  const tier = [...TIERS].reverse().find((t) => bal >= t.min) ?? TIERS[0];
  const nextTierAt = tier.next == null ? null : Math.max(0, tier.next - bal);
  return { balance: bal, points: bal, tier: tier.name, nextTierAt };
}

export function pointsToCreditDollars(points: number): number {
  return Math.max(0, toInt(points, 0)) / LOYALTY.REDEEM_POINTS_PER_DOLLAR;
}

export function creditDollarsToPoints(credit: number): number {
  const c = Number(credit);
  if (!Number.isFinite(c) || c <= 0) return 0;
  return Math.round(c * LOYALTY.REDEEM_POINTS_PER_DOLLAR);
}

export function earnPointsForAmount(args: { amountCents: number; currency: "USD" | "CAD" }): number {
  const cents = Math.max(0, toInt(args.amountCents, 0));
  const dollars = cents / 100;
  const rate = LOYALTY.EARN_POINTS_PER_DOLLAR[args.currency] ?? 0;
  return Math.max(0, Math.round(dollars * rate));
}

/**
 * Clamp a requested redemption (points) to your rules.
 * - returns 0 if below minimum
 * - rounds down to increment
 */
export function normalizeRedeemPoints(requestedPoints: number): number {
  const pts = Math.max(0, toInt(requestedPoints, 0));
  if (pts < LOYALTY.REDEEM_MIN_POINTS) return 0;
  const inc = Math.max(1, LOYALTY.REDEEM_INCREMENT);
  return Math.floor(pts / inc) * inc;
}
