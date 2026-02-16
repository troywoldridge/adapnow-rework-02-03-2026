import type { MetadataRoute } from "next";
import path from "node:path";
import { promises as fsp } from "node:fs";

import categoryAssets from "@/data/categoryAssets.json";
import subcategoryAssets from "@/data/subcategoryAssets.json";
import productAssets from "@/data/productAssets.json";

/**
 * Builds a complete sitemap:
 *  - Home
 *  - Static pages
 *  - Each top-level category (/category/:categorySlug)
 *  - Each subcategory (/category/:categorySlug/:subcategorySlug) — derived defensively
 *  - Each known product id (/product/:id)
 *  - /guides + every PDF under /public/guides/**
 *
 * Notes:
 * - Uses Node runtime because we read from the filesystem.
 * - Cloudflare CDN serves images elsewhere; pricing integrations (SinaLite) don’t affect URLs.
 */

export const runtime = "nodejs";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://americandesignandprinting.com").replace(/\/+$/, "");
const GUIDES_ROOT = path.join(process.cwd(), "public", "guides");

type SmEntry = MetadataRoute.Sitemap[number];

/* --------------------------------- Helpers -------------------------------- */

function safeJoinUrl(base: string, p: string) {
  const b = base.replace(/\/+$/, "");
  const q = String(p || "").trim();
  if (!q) return b;
  return q.startsWith("/") ? `${b}${q}` : `${b}/${q}`;
}

// small helper for slugifying names
const toSlug = (s?: string | number | null) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function walkGuides(dirAbs: string, rel = ""): Promise<{ href: string; mtime: Date }[]> {
  const out: { href: string; mtime: Date }[] = [];

  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fsp.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const e of entries) {
    if (!e?.name || e.name.startsWith(".")) continue; // ignore hidden/system files
    const abs = path.join(dirAbs, e.name);

    // IMPORTANT: href paths must be POSIX-style (sitemap URLs)
    const relPath = path.posix.join(rel, e.name.replaceAll("\\", "/"));

    if (e.isDirectory()) {
      out.push(...(await walkGuides(abs, relPath)));
      continue;
    }

    if (e.isFile() && /\.pdf$/i.test(e.name)) {
      try {
        const stat = await fsp.stat(abs);
        out.push({ href: `/guides/${relPath}`, mtime: stat.mtime });
      } catch {
        // ignore stat errors
      }
    }
  }

  return out;
}

function pushUnique(out: SmEntry[], seen: Set<string>, entry: SmEntry) {
  const url = String(entry?.url || "").trim();
  if (!url) return;
  if (seen.has(url)) return;
  seen.add(url);
  out.push(entry);
}

/* --------------------------------- Sitemap -------------------------------- */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const out: SmEntry[] = [];
  const seenUrls = new Set<string>();

  // Home
  pushUnique(out, seenUrls, {
    url: safeJoinUrl(BASE, "/"),
    lastModified: now,
    changeFrequency: "daily",
    priority: 1.0,
  });

  // Core static pages
  const staticPages = [
    "/support",
    "/accessibility",
    "/guarantees",
    "/shipping",
    "/turnaround",
    "/quotes",
    "/guides",
    "/about",
    "/reviews",
    "/terms",
    "/privacy",
    "/contact",
    "/careers",
  ];

  for (const p of staticPages) {
    const freq = p === "/guides" || p === "/careers" ? "weekly" : "monthly";
    const priority = p === "/guides" || p === "/careers" ? 0.6 : 0.5;

    pushUnique(out, seenUrls, {
      url: safeJoinUrl(BASE, p),
      lastModified: now,
      changeFrequency: freq,
      priority,
    });
  }

  /* ---------------- Categories ----------------
     categoryAssets is an ARRAY like:
     { id, slug, name, cf_image_id?, sort_order?, qa_has_image? }
     Emit by slug; if slug missing, fall back to slugified name or id.
  ------------------------------------------------ */
  type Cat = { id?: number | string | null; slug?: string | null; name?: string | null };
  const cats = categoryAssets as unknown as Cat[];

  const seenCatSlugs = new Set<string>();
  for (const c of cats) {
    const slug = toSlug(c?.slug) || toSlug(c?.name) || (c?.id != null ? toSlug(c.id) : "");
    if (!slug) continue;
    if (seenCatSlugs.has(slug)) continue;
    seenCatSlugs.add(slug);

    pushUnique(out, seenUrls, {
      url: safeJoinUrl(BASE, `/category/${slug}`),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  /* ---------------- Subcategories ----------------
     subcategoryAssets is also an ARRAY, but may NOT have {category_id, slug}.
     We’ll try multiple fields:
       - category key: category_slug OR category_id OR categoryId OR parent_slug
         (falls back to slugified category name if present)
       - subcategory slug: slug OR slugified name OR id
     Only emit when BOTH are present.
  ------------------------------------------------- */
  type AnySub = Record<string, unknown>;
  const subs = subcategoryAssets as unknown as AnySub[];

  const seenSubUrls = new Set<string>();
  for (const s of subs) {
    // possible category fields
    const catRaw =
      (s["category_slug"] as string | undefined) ??
      (s["category_id"] as string | number | null | undefined) ??
      (s["categoryId"] as string | number | null | undefined) ??
      (s["parent_slug"] as string | undefined);

    // possible subcategory fields
    const subSlugRaw = (s["slug"] as string | undefined) ?? null;
    const subName = (s["name"] as string | undefined) ?? null;
    const subId = s["id"];

    const categoryPart =
      toSlug(catRaw as any) ||
      toSlug((s["category_name"] as string | undefined) ?? null);

    const subPart = toSlug(subSlugRaw) || toSlug(subName) || (subId != null ? toSlug(subId as any) : "");

    if (!categoryPart || !subPart) continue;

    const urlPath = `/category/${categoryPart}/${subPart}`;
    const fullUrl = safeJoinUrl(BASE, urlPath);

    // extra dedupe for subcategory urls specifically
    if (seenSubUrls.has(fullUrl)) continue;
    seenSubUrls.add(fullUrl);

    pushUnique(out, seenUrls, {
      url: fullUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  /* ---------------- Products ---------------- */
  const productIds = new Set<number>();
  (productAssets as Array<{ product_id?: number; id?: number | string }>).forEach((p) => {
    const id = Number((p as any)?.product_id ?? (p as any)?.id);
    if (Number.isFinite(id) && id > 0) productIds.add(id);
  });

  // stable ordering
  [...productIds].sort((a, b) => a - b).forEach((id) => {
    pushUnique(out, seenUrls, {
      url: safeJoinUrl(BASE, `/product/${id}`),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  });

  /* ---------------- Guides PDFs ---------------- */
  const pdfs = await walkGuides(GUIDES_ROOT);
  pdfs.sort((a, b) => a.href.localeCompare(b.href));

  for (const f of pdfs) {
    const href = String(f.href || "").trim();
    if (!href) continue;
    pushUnique(out, seenUrls, {
      url: safeJoinUrl(BASE, href),
      lastModified: f.mtime,
      changeFrequency: "yearly",
      priority: 0.3,
    });
  }

  // Final stable sort by URL (optional, but helps keep sitemap diffs clean)
  out.sort((a, b) => String(a.url).localeCompare(String(b.url)));

  return out;
}
