"use client";

import Link from "next/link";
import { useMemo } from "react";

import categoryAssetsRaw from "@/data/categoryAssets.json";

type CatAsset = {
  id?: number | string | null;
  slug?: string | null;
  name?: string | null;
};

type NavItem = {
  key: string;
  slug: string;
  label: string;
};

function toSlug(s?: string | null) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeLabel(name: unknown, fallback: string) {
  const v = String(name ?? "").trim();
  return v || fallback;
}

export type SiteNavProps = {
  /**
   * Max number of categories to show in the top nav.
   * Default: 8
   */
  limit?: number;

  /**
   * Base path for category routes.
   * Default: "/categories"
   */
  basePath?: string;

  /**
   * Optional CSS class for the <nav>.
   */
  className?: string;
};

export default function SiteNav({
  limit = 8,
  basePath = "/categories",
  className = "",
}: SiteNavProps) {
  const items = useMemo<NavItem[]>(() => {
    const cats = (categoryAssetsRaw as CatAsset[]) || [];
    const seen = new Set<string>();
    const out: NavItem[] = [];

    for (const c of cats) {
      const slugFromField = toSlug(c?.slug);
      const slug = slugFromField || (c?.id != null ? String(c.id).trim() : "");
      const slugNorm = toSlug(slug);

      if (!slugNorm) continue;
      if (seen.has(slugNorm)) continue;
      seen.add(slugNorm);

      const label = safeLabel(c?.name, humanize(slugNorm));

      out.push({
        key: `${slugNorm}`,
        slug: slugNorm,
        label,
      });

      if (out.length >= Math.max(0, limit)) break;
    }

    return out;
  }, [limit]);

  const base = basePath.startsWith("/") ? basePath : `/${basePath}`;

  return (
    <nav className={`site-nav ${className}`.trim()} aria-label="Site categories">
      <div className="site-nav__inner">
        <ul className="site-nav__list">
          {items.map((item) => (
            <li key={item.key} className="site-nav__item">
              <Link
                href={`${base}/${encodeURIComponent(item.slug)}`}
                className="site-nav__link"
                prefetch
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function humanize(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}
