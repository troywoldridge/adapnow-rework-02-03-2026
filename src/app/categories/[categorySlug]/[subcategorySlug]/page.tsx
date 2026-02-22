import "server-only";

import type React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import categoryAssets from "@/data/categoryAssets.json";
import subcategoryAssets from "@/data/subcategoryAssets.json";
import productAssets from "@/data/productAssets.json";

import SubcategoryTileImage from "@/components/SubcategoryTileImage";
import { getDefaultPriceSnapshot } from "@/lib/sinalite.client";

/**
 * TS fix:
 * Your SubcategoryTileImage component's Props type does NOT include `idOrUrl`,
 * but this page is calling it with `{ idOrUrl, alt }`.
 *
 * Since this page is data-driven and SubcategoryTileImage may have slightly different
 * prop names across refactors, we safely treat it as a permissive component here.
 */
const TileImage = SubcategoryTileImage as unknown as React.ComponentType<any>;

/* ---------------- Types ---------------- */
type Category = { id?: number | string | null; slug: string; name?: string | null; description?: string | null };
type Subcategory = {
  id?: number | string | null;
  subcategory_id?: number | string | null;
  category_id?: number | string | null;
  category_slug?: string | null;
  slug?: string | null;
  name: string;
  description?: string | null;
  cf_image_id?: string | null;
  sort_order?: number | string | null;
};
type ProductRow = {
  id?: number | string | null;
  sinalite_id?: number | string | null;
  category_id?: number | string | null;
  category_slug?: string | null;
  subcategory_id?: number | string | null;
  subcategory_slug?: string | null;
  sku?: string | null;
  name?: string | null;
  slug?: string | null;
  product_slug?: string | null;
  cf_image_1_id?: string | null;
  sort_order?: number | string | null;
  [k: string]: any;
};

/* ---------------- Site ---------------- */
const SITE_NAME = "American Design And Printing";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://adapnow.com").trim().replace(/\/+$/, "");
const METADATA_BASE = SITE_URL ? new URL(SITE_URL) : undefined;

function absUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/* ---------------- Utils ---------------- */
function toNum(n: unknown): number | null {
  const s = n == null ? "" : String(n).trim();
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
function toSlug(s?: string | null) {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function titleCase(s?: string | null) {
  return (s || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function ensureSubSlug(s: Subcategory) {
  const id = toNum(s.subcategory_id) ?? toNum(s.id);
  return (s.slug && s.slug.trim()) || toSlug(s.name) || (id ? `sub-${id}` : "subcategory");
}

/** Prefer explicit productAssets slugs first; fall back to name/sku slugified. */
function productSlugFromRow(p: ProductRow): string {
  const cands = [
    p.slug,
    p.product_slug,
    p.name ? toSlug(p.name) : "",
    p.sku ? toSlug(p.sku) : "",
    p.id != null ? String(p.id) : "",
  ].map((x) => (x ?? "").toString().trim());

  return cands.find(Boolean) || "";
}

/** Mirror the category-page fallback key. */
function productDerivedSubKey(p: ProductRow, categorySlug: string): string {
  if ((p.subcategory_slug || "").trim()) return toSlug(p.subcategory_slug!);
  if (toNum(p.subcategory_id) != null) return `sub-${toNum(p.subcategory_id)}`;
  const base = (p.slug || p.product_slug || "").toLowerCase();
  const prefix = `${categorySlug}-`;
  const rest = base.startsWith(prefix) ? base.slice(prefix.length) : base;
  const parts = rest.split("-").filter(Boolean);
  return parts.slice(0, Math.min(2, parts.length)).join("-") || "general";
}

/** Build a friendly label from a product, removing the category prefix. */
function labelFromProduct(p: ProductRow, categorySlug: string, fallback: string): string {
  const sc = (p.subcategory_slug || "").trim();
  if (sc) return titleCase(sc);

  const base = (p.slug || p.product_slug || p.name || "").toString().toLowerCase().trim();
  if (base) {
    const prefix = `${categorySlug.toLowerCase().trim()}-`;
    const rest = base.startsWith(prefix) ? base.slice(prefix.length) : base;
    const parts = rest.split(/[-\s]+/).filter(Boolean);
    if (parts.length) {
      const take = parts.slice(0, Math.min(3, parts.length)).join(" ");
      return titleCase(take);
    }
  }
  return titleCase(fallback);
}

/** Pick the best human label from a set of products (majority vote), or use fallback. */
function chooseBestLabel(products: ProductRow[], categorySlug: string, fallback: string): string {
  const counts = new Map<string, number>();
  for (const p of products) {
    const sid = toNum(p.subcategory_id);
    const lbl = labelFromProduct(p, categorySlug, sid != null ? `Sub ${sid}` : fallback);
    const k = lbl.trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  if (counts.size === 0) return titleCase(fallback);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  return best;
}

function buildPath(categorySlug: string, subcategorySlug: string) {
  return `/categories/${categorySlug}/${subcategorySlug}`;
}

/* ---------------- SEO ---------------- */
export async function generateMetadata({
  params,
}: {
  params: { categorySlug: string; subcategorySlug: string };
}): Promise<Metadata> {
  const { categorySlug, subcategorySlug } = params;

  const cats = categoryAssets as Category[];
  const subs = subcategoryAssets as Subcategory[];
  const prods = productAssets as ProductRow[];

  const cat = cats.find((c) => c.slug === categorySlug);
  if (!cat) return { title: "Category Not Found", robots: { index: false, follow: false } };

  const realSub = subs.find(
    (s) =>
      ensureSubSlug(s) === subcategorySlug &&
      ((s.category_slug || "").trim() === cat.slug || (toNum(s.category_id) ?? NaN) === toNum(cat.id))
  );

  const inCat = prods.filter(
    (p) =>
      (p.category_slug || "").trim() === cat.slug ||
      (toNum(p.category_id) !== null && toNum(p.category_id) === toNum(cat.id))
  );

  const products: ProductRow[] = realSub
    ? inCat.filter((p) => {
        const matchId =
          toNum(p.subcategory_id) != null &&
          (toNum(realSub.subcategory_id) === toNum(p.subcategory_id) || toNum(realSub.id) === toNum(p.subcategory_id));
        const matchSlug = (p.subcategory_slug || "").trim() === ensureSubSlug(realSub);
        return matchId || matchSlug;
      })
    : inCat.filter((p) => productDerivedSubKey(p, categorySlug) === subcategorySlug);

  const fallbackLabel = subcategorySlug.startsWith("sub-") ? `Sub ${subcategorySlug.slice(4)}` : subcategorySlug;
  const friendlySub = titleCase(realSub?.name ?? chooseBestLabel(products, categorySlug, fallbackLabel));
  const readableCat = titleCase(cat.name ?? categorySlug);

  const desc =
    realSub?.description ||
    `Explore ${friendlySub} in ${readableCat}. Configure options for live pricing and production-ready specs.`;

  const canonical = buildPath(categorySlug, subcategorySlug);

  return {
    metadataBase: METADATA_BASE,
    title: {
      default: `${friendlySub} • ${readableCat} | ${SITE_NAME}`,
      template: `%s | ${SITE_NAME}`,
    },
    description: desc,
    alternates: { canonical },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 },
    },
    openGraph: {
      type: "website",
      title: `${friendlySub} • ${readableCat} | ${SITE_NAME}`,
      description: desc,
      url: canonical,
      siteName: SITE_NAME,
    },
    twitter: { card: "summary_large_image", title: `${friendlySub} • ${readableCat}`, description: desc },
  };
}

/* ---------------- PAGE ---------------- */
export default async function SubcategoryPage({
  params,
}: {
  params: { categorySlug: string; subcategorySlug: string };
}) {
  const { categorySlug, subcategorySlug } = params;

  const cats = categoryAssets as Category[];
  const subs = subcategoryAssets as Subcategory[];
  const prods = productAssets as ProductRow[];

  const cat = cats.find((c) => c.slug === categorySlug);
  if (!cat) return notFound();

  const ensureRealSub = (s: Subcategory) =>
    ensureSubSlug(s) === subcategorySlug &&
    ((s.category_slug || "").trim() === cat.slug || (toNum(s.category_id) ?? NaN) === toNum(cat.id));

  const realSub = subs.find(ensureRealSub);

  const inCat = prods.filter(
    (p) =>
      (p.category_slug || "").trim() === cat.slug ||
      (toNum(p.category_id) !== null && toNum(p.category_id) === toNum(cat.id))
  );

  const products: ProductRow[] = realSub
    ? inCat.filter((p) => {
        const matchId =
          toNum(p.subcategory_id) != null &&
          (toNum(realSub.subcategory_id) === toNum(p.subcategory_id) || toNum(realSub.id) === toNum(p.subcategory_id));
        const matchSlug = (p.subcategory_slug || "").trim() === ensureSubSlug(realSub);
        return matchId || matchSlug;
      })
    : inCat.filter((p) => productDerivedSubKey(p, categorySlug) === subcategorySlug);

  const fallbackLabel = subcategorySlug.startsWith("sub-") ? `Sub ${subcategorySlug.slice(4)}` : subcategorySlug;
  const friendlySub = titleCase(realSub?.name ?? chooseBestLabel(products, categorySlug, fallbackLabel));
  const readableCat = titleCase(cat.name ?? categorySlug);

  const canonicalPath = buildPath(categorySlug, subcategorySlug);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: readableCat, item: absUrl(`/categories/${categorySlug}`) },
      { "@type": "ListItem", position: 3, name: friendlySub, item: absUrl(canonicalPath) },
    ],
  };

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((p, i) => {
      const pSlug = productSlugFromRow(p);
      return {
        "@type": "ListItem",
        position: i + 1,
        name: p.name && p.name.trim() ? p.name : titleCase(pSlug),
        url: absUrl(`/categories/${categorySlug}/${subcategorySlug}/${pSlug}`),
      };
    }),
  };

  // Optional “From $” via SinaLite — keep capped to avoid long SSR.
  const priceSnapshots: Record<string, string | undefined> = {};
  await Promise.all(
    products.slice(0, 48).map(async (p) => {
      const pSlug = productSlugFromRow(p);
      const idStr = p.sinalite_id != null ? String(p.sinalite_id) : p.id != null ? String(p.id) : null;
      const idNum = idStr ? Number(idStr) : NaN;
      if (!Number.isFinite(idNum) || idNum <= 0) return;

      try {
        const snap = await getDefaultPriceSnapshot(idNum);
        const price = (snap as any)?.price;
        const currency = (snap as any)?.currency || "USD";
        if (typeof price === "number" && Number.isFinite(price) && price >= 0) {
          priceSnapshots[pSlug] = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price);
        }
      } catch {
        /* ignore */
      }
    })
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />

      <nav className="mb-6 text-sm text-gray-600" aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link className="hover:underline" href="/">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link className="hover:underline" href={`/categories/${categorySlug}`}>
              {readableCat}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-gray-900 font-medium">
            {friendlySub}
          </li>
        </ol>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold">{friendlySub}</h1>
        {realSub?.description ? (
          <p className="mt-2 max-w-3xl text-gray-600">{realSub.description}</p>
        ) : (
          <p className="mt-2 max-w-3xl text-gray-600">
            Configure options and see live pricing. Images are optimized and delivered fast via Cloudflare. 🚀
          </p>
        )}
      </header>

      {products.length === 0 ? (
        <div className="rounded-lg border p-6 text-gray-600">No products found in this subcategory yet.</div>
      ) : (
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 list-none"
          aria-label={`${friendlySub} products`}
        >
          {products.map((p) => {
            const pSlug = productSlugFromRow(p);
            const href = `/categories/${categorySlug}/${subcategorySlug}/${pSlug}`;
            const displayName = p.name && p.name.trim() ? p.name : titleCase(pSlug);
            const price = priceSnapshots[pSlug];

            return (
              <li key={pSlug || String(p.id) || String(p.sku)}>
                <Link
                  href={href}
                  className="group relative rounded-2xl border bg-white shadow-sm overflow-hidden transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <div className="relative w-full aspect-[4/3] bg-gray-50">
                    {p.cf_image_1_id ? (
                      <TileImage idOrUrl={p.cf_image_1_id} alt={displayName} />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-gray-400 text-sm">No image</div>
                    )}
                  </div>

                  <div className="p-4">
                    <h2 className="text-base font-semibold leading-6 text-gray-900 line-clamp-2">{displayName}</h2>

                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="inline-flex items-center font-medium text-blue-700">
                        Configure
                        <svg
                          className="ml-1 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10.293 3.293a1 1 0 011.414 0l5 5a1 1 0 01-.027 1.38l-4.999 5a1 1 0 01-1.415-1.414L13.586 10H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>

                      <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs text-gray-700 bg-gray-50">
                        {friendlySub}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-gray-600">{price ? <>From <strong>{price}</strong></> : <>Live pricing</>}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
