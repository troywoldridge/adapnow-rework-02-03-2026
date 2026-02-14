"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

function humanize(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizePath(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "/";

  // strip query/hash if any ever sneak in
  const noQ = s.split("?")[0].split("#")[0];

  // remove trailing slash (except root)
  if (noQ.length > 1 && noQ.endsWith("/")) return noQ.slice(0, -1);
  return noQ;
}

function isActivePath(currentPath: string, href: string): boolean {
  const cur = normalizePath(currentPath);
  const target = normalizePath(href);

  if (cur === target) return true;

  // Mark parent as active for child routes:
  // /category/foo and /category/foo/bar => active
  if (target !== "/" && cur.startsWith(target + "/")) return true;

  return false;
}

export default function MainNav() {
  const pathname = usePathname() || "/";

  const items: MainNavItem[] = TOP_LEVEL_SLUGS.map((slug) => ({
    slug,
    label: humanize(slug),
  }));

  return (
    <nav className="main-nav" aria-label="Main navigation">
      <div className="main-nav__inner">
        {items.map((item) => {
          const slug = (item.slug || "").trim();
          if (!slug) return null;

          // Slugs are controlled constants; encoding is safe either way.
          const href = `/category/${encodeURIComponent(slug)}`;
          const active = isActivePath(pathname, href);

          return (
            <Link
              key={slug}
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
