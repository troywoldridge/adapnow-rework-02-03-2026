"use client";

// src/lib/heroAnalytics.ts
// Lightweight client-side analytics for homepage hero/banner events.
// - Uses sendBeacon when available (best for unload/visibility changes)
// - Falls back to fetch({ keepalive: true })
// - Never throws (analytics should not break UX)

type HeroEventBase = {
  type: "impression" | "click";
  slideId: string;
  timestamp: number;
  page: string;
};

type HeroImpressionEvent = HeroEventBase & {
  type: "impression";
};

type HeroClickEvent = HeroEventBase & {
  type: "click";
  ctaText: string;
};

type HeroEvent = HeroImpressionEvent | HeroClickEvent;

function safePathname(): string {
  try {
    return typeof window !== "undefined" ? window.location.pathname : "";
  } catch {
    return "";
  }
}

function normalize(s: unknown): string {
  return String(s ?? "").trim();
}

async function postHeroEvent(evt: HeroEvent): Promise<void> {
  try {
    // Guard for SSR / weird environments
    if (typeof window === "undefined") return;

    const url = "/api/hero-analytics";
    const body = JSON.stringify(evt);

    // Prefer sendBeacon (non-blocking, survives page unload better)
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
      // If beacon fails, fall through to fetch
    }

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    });
  } catch {
    // swallow; analytics shouldn't break UX
  }
}

export function trackHeroImpression(slideId: string): void {
  const sid = normalize(slideId);
  if (!sid) return;

  void postHeroEvent({
    type: "impression",
    slideId: sid,
    timestamp: Date.now(),
    page: safePathname(),
  });
}

export function trackHeroClick(slideId: string, ctaText: string): void {
  const sid = normalize(slideId);
  const cta = normalize(ctaText);
  if (!sid) return;

  void postHeroEvent({
    type: "click",
    slideId: sid,
    ctaText: cta,
    timestamp: Date.now(),
    page: safePathname(),
  });
}
