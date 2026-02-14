"use client";

/**
 * Beacon-based analytics sender for Careers events.
 * - Prefers navigator.sendBeacon() for unload-safe delivery
 * - Falls back to fetch({ keepalive: true })
 * - Never throws (analytics must not break UX)
 */

export type CareerEventName = "list_view" | "job_view" | "apply_click";

export type TrackCareerEventPayload = Record<string, unknown>;

type CareerEventEnvelope = {
  event: CareerEventName;
  ts: string; // ISO timestamp (server can still override)
  path?: string;
  referrer?: string;
  ua?: string;
} & TrackCareerEventPayload;

const CAREERS_ANALYTICS_ENDPOINT = "/api/analytics/careers";

function safeString(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
}

function buildEnvelope(
  event: CareerEventName,
  payload: TrackCareerEventPayload
): CareerEventEnvelope {
  const path =
    typeof location !== "undefined"
      ? safeString(location.pathname + location.search + location.hash)
      : undefined;

  const referrer =
    typeof document !== "undefined" ? safeString(document.referrer) : undefined;

  const ua =
    typeof navigator !== "undefined" ? safeString(navigator.userAgent) : undefined;

  return {
    event,
    ts: new Date().toISOString(),
    path,
    referrer,
    ua,
    ...payload,
  };
}

/**
 * Track a careers analytics event.
 *
 * Note:
 * - This function intentionally swallows errors.
 * - The server should validate/sanitize payload to avoid log injection / bloat.
 */
export async function trackCareerEvent(
  event: CareerEventName,
  payload: TrackCareerEventPayload = {}
): Promise<void> {
  try {
    // Guard: in rare cases, code can be invoked in non-browser contexts.
    if (typeof window === "undefined") return;

    const envelope = buildEnvelope(event, payload);
    const body = JSON.stringify(envelope);

    // Prefer sendBeacon for reliability during page navigation/unload.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(CAREERS_ANALYTICS_ENDPOINT, blob);

      // If sendBeacon fails (returns false), attempt fetch fallback.
      if (ok) return;
    }

    // Fallback: keepalive fetch
    await fetch(CAREERS_ANALYTICS_ENDPOINT, {
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
