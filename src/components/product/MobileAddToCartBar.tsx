// src/components/product/MobileAddToCartBar.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  productName: string;
  startingPrice?: string; // e.g. "$29.99"
  cta?: string; // default "Customize & Price"
  targetId?: string; // default "buy-box"
  /** Hide bar until user scrolls a bit (prevents covering hero on load). Default true. */
  showAfterScroll?: boolean;
  /** Pixels to scroll before showing (only used when showAfterScroll is true). Default 160. */
  showAfterPx?: number;
};

export default function MobileAddToCartBar({
  productName,
  startingPrice,
  cta = "Customize & Price",
  targetId = "buy-box",
  showAfterScroll = true,
  showAfterPx = 160,
}: Props) {
  const [visible, setVisible] = useState(!showAfterScroll);

  useEffect(() => {
    if (!showAfterScroll) return;

    const onScroll = () => {
      const y = window.scrollY || 0;
      setVisible(y >= showAfterPx);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showAfterPx, showAfterScroll]);

  const label = useMemo(() => (productName || "").trim() || "Product", [productName]);

  const onClick = useCallback(() => {
    const el = document.getElementById(targetId);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "start" });

    const focusable = el.querySelector(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) as HTMLElement | null;

    if (focusable) {
      window.setTimeout(() => {
        try {
          focusable.focus({ preventScroll: true });
        } catch {
          focusable.focus();
        }
      }, 350);
    }
  }, [targetId]);

  if (!visible) return null;

  return (
    <div
      className="
        fixed inset-x-0 bottom-0 z-[70] md:hidden
        border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80
        px-4 py-3
        [padding-bottom:calc(env(safe-area-inset-bottom,0)+0.75rem)]
      "
      role="region"
      aria-label="Mobile purchase actions"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">{label}</div>
          {startingPrice ? (
            <div className="text-xs text-gray-600">
              From <span className="font-semibold text-gray-900">{startingPrice}</span>
            </div>
          ) : (
            <div className="text-xs text-gray-500">Configure options to see price</div>
          )}
        </div>

        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          aria-controls={targetId}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
