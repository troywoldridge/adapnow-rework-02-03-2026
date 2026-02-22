import Link from "next/link";
import type { Category } from "@/types/category";
import type { Subcategory } from "@/types/subcategory";
import type { Product } from "@/types/product";

/**
 * Your imported Category/Subcategory/Product types are currently resolving to `{}` (or too-loose),
 * so TS won't allow property access (id/name).
 *
 * Fix: accept the external types for compatibility, but immediately narrow them to a safe shape
 * with tiny runtime guards before reading fields.
 */

export type ProductBreadcrumbsProps = {
  category?: Category;
  subcategory?: Subcategory;
  product?: Product;
};

type Crumb = {
  key: string;
  label: string;
  href?: string;
  current?: boolean;
};

type IdNameLike = {
  id: string | number;
  name?: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toIdNameLike(input: unknown, fallbackName: string): IdNameLike | null {
  if (!isRecord(input)) return null;

  const idRaw = input.id;
  const id =
    typeof idRaw === "string" || typeof idRaw === "number" ? idRaw : null;
  if (id === null) return null;

  const nameRaw = input.name;
  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw
      : fallbackName;

  return { id, name };
}

export default function ProductBreadcrumbs({
  category,
  subcategory,
  product,
}: ProductBreadcrumbsProps) {
  const cat = toIdNameLike(category as unknown, "Category");
  const sub = toIdNameLike(subcategory as unknown, "Subcategory");
  const prod = toIdNameLike(product as unknown, "Product");

  const crumbs: Crumb[] = [{ key: "all", label: "All Products", href: "/categories" }];

  if (cat) {
    crumbs.push({
      key: `cat:${String(cat.id)}`,
      label: cat.name ?? "Category",
      href: `/categories/${encodeURIComponent(String(cat.id))}`,
    });
  }

  if (sub) {
    crumbs.push({
      key: `sub:${String(sub.id)}`,
      label: sub.name ?? "Subcategory",
      href: `/subcategories/${encodeURIComponent(String(sub.id))}`,
    });
  }

  if (prod) {
    crumbs.push({
      key: `prod:${String(prod.id)}`,
      label: prod.name ?? "Product",
      current: true,
    });
  }

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol className="breadcrumbs__list">
        {crumbs.map((c, idx) => {
          const isLast = idx === crumbs.length - 1;

          return (
            <li key={c.key} className="breadcrumbs__item">
              {c.href && !c.current ? (
                <Link className="breadcrumbs__link" href={c.href}>
                  {c.label}
                </Link>
              ) : (
                <span
                  className={`breadcrumbs__current${c.current ? " is-current" : ""}`}
                  aria-current={c.current ? "page" : undefined}
                >
                  {c.label}
                </span>
              )}

              {!isLast ? (
                <span className="breadcrumbs__sep" aria-hidden="true">
                  ›
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
