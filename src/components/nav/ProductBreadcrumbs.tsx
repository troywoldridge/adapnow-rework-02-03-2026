import Link from "next/link";
import type { Category } from "@/types/category";
import type { Subcategory } from "@/types/subcategory";
import type { Product } from "@/types/product";

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

export default function ProductBreadcrumbs({
  category,
  subcategory,
  product,
}: ProductBreadcrumbsProps) {
  const crumbs: Crumb[] = [
    { key: "all", label: "All Products", href: "/categories" },
  ];

  if (category) {
    crumbs.push({
      key: `cat:${category.id}`,
      label: category.name ?? "Category",
      href: `/categories/${encodeURIComponent(String(category.id))}`,
    });
  }

  if (subcategory) {
    crumbs.push({
      key: `sub:${subcategory.id}`,
      label: subcategory.name ?? "Subcategory",
      href: `/subcategories/${encodeURIComponent(String(subcategory.id))}`,
    });
  }

  if (product) {
    crumbs.push({
      key: `prod:${product.id}`,
      label: product.name ?? "Product",
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
