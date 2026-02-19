"use client";

export function trackCareerEvent(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  try {
    console.log("[analytics]", event, data ?? {});
  } catch {
    // swallow
  }
}
