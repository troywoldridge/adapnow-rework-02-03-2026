"use client";

import { useEffect, useMemo, useRef } from "react";
import { trackCareerEvent } from "@/lib/analyticsClient";

type Props = {
  jobSlug: string;
  jobTitle?: string;
  location?: string;
  employmentType?: string;
};

function norm(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
}

export default function JobViewTracker({
  jobSlug,
  jobTitle,
  location,
  employmentType,
}: Props) {
  const payload = useMemo(
    () => ({
      jobSlug: norm(jobSlug) ?? "",
      jobTitle: norm(jobTitle),
      location: norm(location),
      employmentType: norm(employmentType),
    }),
    [jobSlug, jobTitle, location, employmentType]
  );

  // Prevent duplicates in React Strict Mode (dev) and avoid re-firing for the same job.
  const lastTrackedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    if (!payload.jobSlug) return;

    // Track once per slug (per page view). If you want to re-track when details change,
    // we can key by a richer fingerprint instead.
    if (lastTrackedSlugRef.current === payload.jobSlug) return;
    lastTrackedSlugRef.current = payload.jobSlug;

    try {
      trackCareerEvent("job_view", payload);
    } catch {
      // Never block rendering/navigation if analytics fails
    }
  }, [payload]);

  return null;
}
