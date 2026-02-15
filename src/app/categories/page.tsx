import "server-only";

import type { Metadata } from "next";
import Link from "next/link";

import categoryAssets from "@/data/categoryAssets.json";
import { cfFirst } from "@/lib/cfImages"; // we only need cfFirst here

/* ---------------- Types ---------------- */
type Category = {
  id: number;
  slug: string;
  name: string;
  cf_image_id?: string | null;
  description?: string | null;
  sort_order?: number | null;
};

/* ---------------- Site ---------------- */
const SITE_NAME = "American Design And Printing";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://adapnow.com").trim().replace(/\/+$/, "");
const METADATA_BASE = SITE_URL ? new URL(SITE_URL) : undefined;

function absUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/* ---------------- SEO ---------------- */
export const metadata: Metadata = {
  metadataBase: METADATA_BASE,
  title: {
    default: `Shop by Category | ${SITE_NAME}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Explore top print categories—business cards, large format, labels & packaging, apparel and more. Fast turnaround & trade pricing.",
  alternates: { canonical: "/categories" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    title: `Shop by Category | ${SITE_NAME}`,
    description:
      "Explore top print categories—business cards, large format, labels & packaging, apparel and more. Fast turnaround & trade pricing.",
    url: "/categories",
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `Shop by Category | ${SITE_NAME}`,
    description:
      "Explore top print categories—business cards, large format, labels & packaging, apparel and more. Fast turnaround & trade pricing.",
  },
};

export default function CategoriesIndexPage() {
  const categories: Category[] = (categoryAssets as Category[])
    .slice()
    .sort((a, b) => Number(a.sort_order ?? 9999) - Number(b.sort_order ?? 9999));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
    ],
  };

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: categories.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      url: absUrl(`/categories/${c.slug}`), // ✅ correct route
      image: c.cf_image_id
        ? cfFirst(c.cf_image_id, ["categoryThumb", "category", "hero", "public"])
        : undefined,
    })),
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />

      <nav className="mb-6 text-sm text-gray-600" aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link className="hover:underline" href="/">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-gray-900 font-medium">
            Categories
          </li>
        </ol>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold">Shop by Category</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Trade-only pricing, fast turnaround, and pro quality across our full print lineup.
        </p>
      </header>

      {categories.length === 0 ? (
        <div className="rounded-lg border p-6 text-gray-600">No categories found.</div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 list-none" aria-label="Categories">
          {categories.map((c) => {
            const img = c.cf_image_id
              ? cfFirst(c.cf_image_id, ["categoryThumb", "category", "hero", "public"])
              : "";

            return (
              <li key={c.slug}>
                <Link
                  href={`/categories/${c.slug}`} // ✅ correct route
                  className="block rounded-xl overflow-hidden bg-white border shadow-sm hover:shadow-md transition"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {img ? (
                    <img
                      src={img}
                      alt={c.name}
                      className="w-full aspect-[4/3] object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full aspect-[4/3] bg-gray-100" />
                  )}

                  <div className="p-4">
                    <div className="font-medium text-gray-900">{c.name}</div>
                    {c.description ? <p className="text-gray-600 text-sm mt-1">{c.description}</p> : null}
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
