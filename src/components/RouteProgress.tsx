// src/components/RouteProgress.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import NProgress from "nprogress";

/**
 * App Router route progress indicator.
 *
 * Notes:
 * - We start progress on pathname changes only (not search param churn) to avoid spammy bars.
 * - Debounced start prevents flicker on very fast navigations.
 * - CSS is expected to live in globals.css (do NOT import nprogress css here).
 */

// Configure once (module scope)
NProgress.configure({
  showSpinner: false,
  trickleSpeed: 120,
  minimum: 0.08,
});

export default function RouteProgress() {
  const pathname = usePathname();

  const first = useRef(true);
  const startTimer = useRef<number | null>(null);
  const doneTimer = useRef<number | null>(null);

  useEffect(() => {
    // Skip initial mount
    if (first.current) {
      first.current = false;
      return;
    }

    // Safety: clear any prior timers
    if (startTimer.current) window.clearTimeout(startTimer.current);
    if (doneTimer.current) window.clearTimeout(doneTimer.current);

    // Debounce start slightly to avoid flicker on instant route transitions
    startTimer.current = window.setTimeout(() => {
      try {
        NProgress.start();
      } catch {
        // ignore
      }
    }, 80);

    // Ensure we complete shortly after render (App Router doesn't expose route events)
    doneTimer.current = window.setTimeout(() => {
      try {
        NProgress.done(true);
      } catch {
        // ignore
      }
    }, 450);

    return () => {
      if (startTimer.current) window.clearTimeout(startTimer.current);
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
    };
  }, [pathname]);

  return null;
}
