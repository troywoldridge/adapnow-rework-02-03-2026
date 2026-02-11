"use client";

/**
 * Beacon-based analytics sender for Careers events.
 * Uses sendBeacon when available; falls back to fetch(keepalive).
 *
 * Goal: never block UX, never throw.
 */

export type CareerEventName = "list_view" | "job_view" | "apply_click";

type BaseCareerPayload = {
  /** Optional pathname at time of event */
  path?: string;
  /** Optional ISO timestamp override (we default it) */
  ts?: string;
  /** Optional source tag (utm, component, etc.) */
  source?: string;
};

export type CareerEventPayloads = {
  list_view: BaseCareerPayload & {
    query?: string;
    filters?: Record<string, string | number | boolean | null>;
    page?: number;
  };
  job_view: BaseCareerPayload & {
    jobId?: string;
    slug?: string;
    title?: string;
    location?: string;
  };
  apply_click: BaseCareerPayload & {
    jobId?: string;
    slug?: string;
    method?: "internal" | "external";
    destination?: string;
  };
};

function nowIso(): string {
  return new Date().toISOString();
}

function safePath(): string {
  try {
    return typeof window !== "undefined" ? window.location.pathname : "";
  } catch {
    return "";
  }
}

function hasSendBeacon(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function";
}

/**
 * Track a careers analytics event.
 */
export async function trackCareerEvent<E extends CareerEventName>(
  event: E,
  payload: CareerEventPayloads[E] = {} as CareerEventPayloads[E],
): Promise<void> {
  try {
    const url = "/api/analytics/careers";

    const enriched = {
      event,
      ts: payload?.ts ?? nowIso(),
      path: payload?.path ?? safePath(),
      ...payload,
    };

    const body = JSON.stringify(enriched);

    if (hasSendBeacon()) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
      // If sendBeacon fails, fall through to fetch.
    }

    await fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    // swallow; analytics shouldn't break UX
  }
}
