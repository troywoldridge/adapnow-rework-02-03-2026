"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

export type MainNavItem = {
  slug: string;
  label: string;
};

const TOP_LEVEL_SLUGS = [
  "business-cards",
  "print-products",
  "large-format",
  "stationery",
  "promotional",
  "labels-and-packaging",
  "apparel",
  "sample-kits",
] as const;

function humanize(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizePath(p: string): string {
  if (!p) return "/";
  const s = p.trim();
  if (s.length > 1 && s.endsWith("/")) return s.slice(0, -1);
  return s;
}

function isActivePath(currentPath: string, href: string): boolean {
  const cur = normalizePath(currentPath);
  const target = normalizePath(href);

  if (cur === target) return true;

  // Consider child routes active (e.g. /category/foo/bar)
  if (target !== "/" && cur.startsWith(target + "/")) return true;

  return false;
}

export default function MainNav() {
  const pathname = usePathname() || "/";

  const items: MainNavItem[] = useMemo(() => {
    return TOP_LEVEL_SLUGS.map((slug) => ({
      slug,
      label: humanize(slug),
    }));
  }, []);

  return (
    <nav className="main-nav" aria-label="Main navigation">
      <div className="main-nav__inner">
        {items.map((item) => {
          const href = `/category/${encodeURIComponent(item.slug)}`;
          const active = isActivePath(pathname, href);

          return (
            <Link
              key={item.slug}
              href={href}
              className={`main-nav__item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              prefetch
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
