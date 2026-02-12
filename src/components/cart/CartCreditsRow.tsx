// src/components/cart/CartCreditsRow.tsx
// Server component (no hooks) — safe to render inside Review page.

type Currency = "USD" | "CAD";

type Props = {
  /** Credits to apply in CENTS (e.g. 1500 => $15.00). If 0 or less, renders nothing. */
  creditsCents?: number;
  /** ISO currency (display only). Pricing/estimator remain per SinaLite API docs. */
  currency?: Currency;
};

function toCents(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n);
}

function moneyFmt(amount: number, currency: Currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    // Fallback for environments missing Intl currency data
    const sign = amount < 0 ? "-" : "";
    const abs = Math.abs(amount);
    return `${sign}$${abs.toFixed(2)}`;
  }
}

export default function CartCreditsRow({
  creditsCents = 0,
  currency = "USD",
}: Props) {
  const cents = Math.max(0, toCents(creditsCents));
  if (cents <= 0) return null;

  const dollars = cents / 100;

  // Represent credits as a negative line item for display.
  const display = moneyFmt(-dollars, currency);

  return (
    <div className="flex justify-between py-2 text-emerald-700">
      <span className="font-medium">Loyalty credits</span>
      <span>{display}</span>
    </div>
  );
}
