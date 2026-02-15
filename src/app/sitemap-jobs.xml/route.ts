// src/app/sitemap-jobs.xml/route.ts
import { NextResponse } from "next/server";
import { JOBS, siteUrl } from "@/data/jobs";

// Custom XML route for /sitemap-jobs.xml
// Surfaces per-job URLs to crawlers, alongside your main /sitemap.xml

function escapeXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function stripTrailingSlashes(s: string) {
  return s.replace(/\/+$/, "");
}

function joinUrl(base: string, p: string) {
  const b = stripTrailingSlashes(base);
  const path = p.startsWith("/") ? p : `/${p}`;
  return `${b}${path}`;
}

function isoDateOnly(d: Date) {
  // Sitemap <lastmod> can be full ISO, but date-only is fine and stable.
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const base = stripTrailingSlashes(siteUrl());

  // Avoid "everything changed right now" — crawlers hate that.
  // If you have real per-job updatedAt fields, plug them in here.
  // For now we use a stable build-time-ish date from env, with a safe fallback.
  const fallbackLastMod =
    (process.env.JOBS_SITEMAP_LASTMOD || process.env.NEXT_PUBLIC_JOBS_SITEMAP_LASTMOD || "").trim();

  const defaultDate = fallbackLastMod
    ? fallbackLastMod
    : isoDateOnly(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); // "about a week ago" stable-ish

  const urls = JOBS.map((job) => {
    const loc = joinUrl(base, `/careers/${job.slug}`);

    // If your job objects have an updated/posted date, prefer it.
    // Common patterns:
    // - job.updatedAt (ISO)
    // - job.updated_at (ISO)
    // - job.lastmod (ISO)
    // - job.date (YYYY-MM-DD)
    const jobLastModRaw =
      // @ts-expect-error - allow flexible job shape without forcing a schema change
      (job.updatedAt || job.updated_at || job.lastmod || job.date || "").toString().trim();

    // Use job date if present, else fallback to stable default.
    const lastmod = jobLastModRaw || defaultDate;

    return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml"
>
  ${urls}
</urlset>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Cache at the edge; adjust up if JOBS changes rarely.
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
