import "server-only";

export type TaxLocation = {
  country?: string | null;   // "US", "CA"
  state?: string | null;     // "NY", "ON"
  postalCode?: string | null;
  city?: string | null;
};

export type TaxInput = {
  currency: "USD" | "CAD";
  subtotalCents: number;
  shippingCents: number;
  creditsCents: number;
  location: TaxLocation | null;
};

export type TaxResult = {
  taxCents: number;
  rate: number; // 0..1
  source: "placeholder";
  notes?: string;
};

/**
 * Placeholder tax calculator.
 * Today: always returns 0.
 *
 * Later: swap this implementation to Stripe Tax, TaxJar, Avalara, etc.
 */
export function calculateTaxCents(input: TaxInput): TaxResult {
  void input; // keep signature stable

  return {
    taxCents: 0,
    rate: 0,
    source: "placeholder",
    notes: "Tax not yet implemented",
  };
}
