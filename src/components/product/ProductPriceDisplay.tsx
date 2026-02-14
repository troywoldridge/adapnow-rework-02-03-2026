// src/components/product/ProductPriceDisplay.tsx
"use client";

import { useMemo } from "react";

type Props = {
  /** The current product price in major currency units (e.g. 5.28), or null if not yet determined */
  price: number | null;
  /** ISO currency code, defaults to USD */
  currency?: "USD" | "CAD" | string;
  /** Optional placeholder text */
  placeholder?: string;
  className?: string;
};

export default function ProductPriceDisplay({
  price,
  currency = "USD",
  placeholder = "Select options to see price",
  className = "mt-4 text-xl font-bold text-gray-900",
}: Props) {
  const formatted = useMemo(() => {
    if (price == null) return null;
    const n = Number(price);
    if (!Number.isFinite(n)) return null;

    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      // Fallback if currency code is invalid
      return new Intl.NumberFormat("en-US", {
        style: "decimal",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
    }
  }, [price, currency]);

  return (
    <div role="status" aria-live="polite" className={className}>
      {formatted ? <span>{formatted}</span> : <span className="text-gray-500">{placeholder}</span>}
    </div>
  );
}
