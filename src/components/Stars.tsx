"use client";

import * as React from "react";

type Props = {
  value: number; // 0..max
  max?: number; // default 5
  size?: number; // px
  readOnly?: boolean;
  onChange?: (next: number) => void;
  className?: string;
  label?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Star({
  filled,
  size,
  title,
}: {
  filled: boolean;
  size: number;
  title?: string;
}) {
  // Simple star icon (solid when filled, outline when not)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={filled ? "opacity-100" : "opacity-35"}
    >
      <path
        fill="currentColor"
        d="M12 17.27l5.18 3.03-1.64-5.81L20 10.24l-5.97-.52L12 4.25 9.97 9.72 4 10.24l4.46 4.25-1.64 5.81L12 17.27z"
      />
      {title ? <title>{title}</title> : null}
    </svg>
  );
}

export default function Stars({
  value,
  max = 5,
  size = 18,
  readOnly = true,
  onChange,
  className,
  label = "Rating",
}: Props) {
  const v = clamp(Number.isFinite(value) ? value : 0, 0, max);

  const canInteract = !readOnly && typeof onChange === "function";

  return (
    <div className={className} role="group" aria-label={label}>
      <div className="inline-flex items-center gap-1">
        {Array.from({ length: max }).map((_, i) => {
          const n = i + 1;
          const filled = v >= n;

          if (!canInteract) {
            return <Star key={n} filled={filled} size={size} title={`${n} star`} />;
          }

          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="inline-flex items-center justify-center"
              aria-label={`Set rating to ${n} out of ${max}`}
              title={`${n}/${max}`}
            >
              <Star filled={filled} size={size} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
