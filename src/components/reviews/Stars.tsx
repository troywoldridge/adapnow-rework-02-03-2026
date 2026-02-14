// src/components/reviews/Stars.tsx
"use client";

import * as React from "react";

type Props = {
  /** Rating value (supports decimals, e.g. 4.7) */
  value: number;
  /** Pixel size of each star */
  size?: number;
  /** Optional className for the wrapper */
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function Star({
  variant,
  size,
}: {
  variant: "full" | "half" | "empty";
  size: number;
}) {
  // Star path (heroicons solid star)
  const d =
    "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.053 3.24a1 1 0 00.95.69h3.405c.967 0 1.371 1.24.588 1.81l-2.756 2.003a1 1 0 00-.364 1.118l1.053 3.24c.3.921-.755 1.688-1.54 1.118l-2.756-2.003a1 1 0 00-1.176 0l-2.756 2.003c-.784.57-1.838-.197-1.54-1.118l1.053-3.24a1 1 0 00-.364-1.118L2.453 8.667c-.783-.57-.379-1.81.588-1.81h3.405a1 1 0 00.95-.69l1.053-3.24z";

  if (variant === "half") {
    // Two-layer approach: empty star + clipped full star
    return (
      <span className="relative inline-block" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 20 20"
          className="fill-gray-300"
          aria-hidden="true"
        >
          <path d={d} />
        </svg>
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: "50%" }}
          aria-hidden="true"
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 20 20"
            className="fill-yellow-500"
          >
            <path d={d} />
          </svg>
        </span>
      </span>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={variant === "full" ? "fill-yellow-500" : "fill-gray-300"}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * Stars
 * - Supports fractional averages (e.g. 4.3)
 * - Accessible label for screen readers
 */
export default function Stars({ value, size = 16, className = "" }: Props) {
  const raw = Number(value);
  const v = Number.isFinite(raw) ? clamp(raw, 0, 5) : 0;

  const full = Math.floor(v);
  const frac = v - full;
  const half = frac >= 0.25 && frac < 0.75 ? 1 : 0;
  const roundedUp = frac >= 0.75 ? 1 : 0;

  const fullCount = clamp(full + roundedUp, 0, 5);
  const halfCount = fullCount === 5 ? 0 : half;
  const emptyCount = clamp(5 - fullCount - halfCount, 0, 5);

  const label = `${v.toFixed(1)} out of 5`;

  return (
    <div
      role="img"
      aria-label={label}
      className={`inline-flex items-center gap-0.5 ${className}`}
    >
      {Array.from({ length: fullCount }).map((_, i) => (
        <Star key={`f-${i}`} variant="full" size={size} />
      ))}
      {halfCount ? <Star variant="half" size={size} /> : null}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <Star key={`e-${i}`} variant="empty" size={size} />
      ))}
    </div>
  );
}
