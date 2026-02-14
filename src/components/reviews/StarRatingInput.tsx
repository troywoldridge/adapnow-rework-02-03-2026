// src/components/reviews/StarRatingInput.tsx
"use client";

import * as React from "react";

type Props = {
  /** Controlled value (0..max). Use 0 when nothing selected yet. */
  value: number;
  /** Called when user selects a rating */
  onChange: (next: number) => void;

  max?: number; // default 5
  size?: number; // px, default 28

  /** Optional label for screen readers and UI */
  label?: string;

  /** Disable interaction */
  disabled?: boolean;

  className?: string;
};

function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.round(n) : min;
  return Math.min(max, Math.max(min, x));
}

function StarIcon({
  filled,
  size,
  className,
}: {
  filled: boolean;
  size: number;
  className?: string;
}) {
  // Simple star path (same geometry each time)
  // (20x20 viewBox, looks good at common sizes)
  const d =
    "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.053 3.24a1 1 0 00.95.69h3.405c.967 0 1.371 1.24.588 1.81l-2.756 2.003a1 1 0 00-.364 1.118l1.053 3.24c.3.921-.755 1.688-1.54 1.118l-2.756-2.003a1 1 0 00-1.176 0l-2.756 2.003c-.784.57-1.838-.197-1.54-1.118l1.053-3.24a1 1 0 00-.364-1.118L2.453 8.667c-.783-.57-.379-1.81.588-1.81h3.405a1 1 0 00.95-.69l1.053-3.24z";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={[
        filled ? "fill-yellow-500" : "fill-gray-300",
        className || "",
      ].join(" ")}
    >
      <path d={d} />
    </svg>
  );
}

/**
 * StarRatingInput
 * - Accessible (radiogroup + keyboard support)
 * - Tailwind-only (no styled-jsx, no inline style blocks)
 * - Controlled input, works great with forms
 */
export default function StarRatingInput({
  value,
  onChange,
  max = 5,
  size = 28,
  label = "Rating",
  disabled = false,
  className = "",
}: Props) {
  const [hover, setHover] = React.useState<number | null>(null);

  const safeMax = clampInt(max, 1, 10);
  const safeValue = clampInt(value, 0, safeMax);
  const display = hover ?? safeValue;

  // Keyboard:
  // - Left/Down: decrease
  // - Right/Up: increase
  // - Home: 1 (or 0 if you want "clear"; we keep 1 for radio semantics)
  // - End: max
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    const key = e.key;
    let next: number | null = null;

    if (key === "ArrowLeft" || key === "ArrowDown") next = Math.max(1, safeValue - 1);
    if (key === "ArrowRight" || key === "ArrowUp") next = Math.min(safeMax, safeValue + 1);
    if (key === "Home") next = 1;
    if (key === "End") next = safeMax;

    if (next != null) {
      e.preventDefault();
      onChange(next);
    }
  };

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled ? "true" : "false"}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        className={[
          "inline-flex items-center gap-1 select-none",
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        {Array.from({ length: safeMax }).map((_, i) => {
          const star = i + 1;
          const filled = display >= star;

          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={safeValue === star}
              aria-label={`${star} out of ${safeMax}`}
              disabled={disabled}
              onMouseEnter={() => (disabled ? null : setHover(star))}
              onMouseLeave={() => setHover(null)}
              onFocus={() => (disabled ? null : setHover(star))}
              onBlur={() => setHover(null)}
              onClick={() => (disabled ? null : onChange(star))}
              className={[
                "rounded-md",
                "focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2",
                disabled ? "" : "hover:scale-[1.03] active:scale-[0.98]",
              ].join(" ")}
            >
              <StarIcon filled={filled} size={size} />
            </button>
          );
        })}
      </div>

      <div className="mt-1 text-sm text-gray-600">
        {safeValue > 0 ? (
          <span>
            Your rating: <span className="font-semibold text-gray-900">{safeValue}</span>/{safeMax}
          </span>
        ) : (
          <span>Select a rating</span>
        )}
      </div>

      {/* Screen-reader only hint for keyboard */}
      <span className="sr-only">
        Use arrow keys to change rating, Home for 1, End for {safeMax}.
      </span>
    </div>
  );
}
