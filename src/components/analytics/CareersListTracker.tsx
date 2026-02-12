"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackCareerEvent } from "@/lib/analyticsClient";

type Props = {
  /**
   * Optional: only fire when the pathname matches this value.
   * Example: "/careers"
   * If omitted, it will fire on every route where this component is mounted.
   */
  pathnameMustBe?: string;

  /**
   * Optional: event name override
   * Default: "list_view"
   */
  eventName?: string;
};

export default function CareersListTracker({
  pathnameMustBe,
  eventName = "list_view",
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Build a stable key representing the current "view" of the list.
  // If filters/sort/page are in the querystring, this changes and will re-track.
  const query = searchParams?.toString() ?? "";
  const viewKey = `${pathname}?${query}`;

  // Guard against React Strict Mode (dev) running effects twice.
  // We only want to track once per unique viewKey.
  const lastTrackedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    if (pathnameMustBe && pathname !== pathnameMustBe) return;

    if (lastTrackedKeyRef.current === viewKey) return;
    lastTrackedKeyRef.current = viewKey;

    try {
      trackCareerEvent(eventName, {
        pathname,
        query: query || undefined,
        viewKey,
      });
    } catch {
      // Never block rendering/navigation if analytics fails
    }
  }, [pathname, query, viewKey, pathnameMustBe, eventName]);

  return null;
}
