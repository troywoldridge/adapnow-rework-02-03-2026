import "server-only";

import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import Hero from "@/components/Hero";
import FeaturedCategories from "@/components/FeaturedCategories";
import { getLocalCategories } from "@/lib/catalogLocal";
import SignupPromoCard from "@/components/SignupPromoCard";
import SalesCards, { type SaleCard } from "@/components/SalesCards";
import HomeShellClient from "./HomeShellClient";

type LocalCategory = {
  slug: string;
  name: string;
  image?: string | null;
  description?: string | null;
};

const SITE_NAME = "American Design And Printing";
const BRAND = "ADAP";
const DEFAULT_DESCRIPTION =
  "Premium print, packaging, and promotional products with reliable turnaround, fair pricing, and real human support.";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
const METADATA_BASE = SITE_URL ? new URL(SITE_URL) : undefined;

export const metadata: Metadata = {
  metadataBase: METADATA_BASE,
  title: {
    default: `${SITE_NAME} | Print, Packaging & Promotional Products`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: `${SITE_NAME} | Print, Packaging & Promotional Products`,
    description: DEFAULT_DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Print, Packaging & Promotional Products`,
    description: DEFAULT_DESCRIPTION,
  },
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
  // Keep keywords restrained; homepage can have a short set.
  keywords: [
    "American Design And Printing",
    "ADAP",
    "custom printing",
    "business cards",
    "postcards",
    "banners",
    "signage",
    "packaging",
    "promotional products",
  ],
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

function buildJsonLd() {
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: BRAND,
    url: SITE_URL || undefined,
    description: DEFAULT_DESCRIPTION,
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL || undefined,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    // If/when you add on-site search, wire this up:
    // potentialAction: {
    //   "@type": "SearchAction",
    //   target: `${SITE_URL}/search?q={search_term_string}`,
    //   "query-input": "required name=search_term_string",
    // },
  };

  const webpage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${SITE_NAME} | Print, Packaging & Promotional Products`,
    url: SITE_URL ? `${SITE_URL}/` : undefined,
    description: DEFAULT_DESCRIPTION,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL || undefined,
    },
    about: {
      "@type": "Organization",
      name: SITE_NAME,
    },
  };

  return [org, website, webpage];
}

export default function HomePage() {
  const categories = getLocalCategories() as LocalCategory[];

  // Keep featured categories stable and intentional (SEO + UX)
  const featuredSlugs = ["business-cards", "large-format", "print-products"];
  const featured = featuredSlugs
    .map((slug) => categories.find((c) => c.slug === slug) || null)
    .filter((c): c is LocalCategory => !!c)
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      imageUrl: c.image ?? "",
      href: `/categories/${c.slug}`,
      description: c.description ?? undefined,
    }));

  const promos: SaleCard[] = [
    {
      id: "foam-board",
      name: "Foam Board",
      href: "/products/foam-board",
      imageUrl:
        "https://imagedelivery.net/pJ0fKvjCAbyoF8aD0BGu8Q/e02bbfd1-7096-4c3b-9c50-61b5a7d26100/saleCard",
      discountLabel: "10% OFF",
    },
    {
      id: "door-hangers",
      name: "Door Hangers",
      href: "/products/door-hangers",
      imageUrl:
        "https://imagedelivery.net/pJ0fKvjCAbyoF8aD0BGu8Q/49701951-43d8-4abc-5dcc-2101ef4cdd00/saleCard",
      discountLabel: "10% OFF",
    },
    {
      id: "soft-touch-bc",
      name: "Soft Touch Business Cards",
      href: "/products/soft-touch-business-cards",
      imageUrl:
        "https://imagedelivery.net/pJ0fKvjCAbyoF8aD0BGu8Q/0053681e-2792-4571-ef75-b844fd438400/saleCard",
      discountLabel: "10% OFF",
    },
  ];

  const jsonLd = buildJsonLd();

  return (
    <HomeShellClient>
      <main id="main">
        {/* Structured data for Google */}
        {jsonLd.map((obj, idx) => (
          <script
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }}
            key={idx}
            type="application/ld+json"
          />
        ))}

        {/* If Hero already renders an H1, this is harmless (SR-only would be redundant),
            but it’s safer to ensure the page has one. */}
        <h1 className="sr-only">
          {SITE_NAME} ({BRAND}) — Print, Packaging & Promotional Products
        </h1>

        {/* Signup promo (client) */}
        <section aria-label="Promotions">
          <Suspense fallback={<div className="sr-only">Loading promotions…</div>}>
            <SignupPromoCard />
          </Suspense>
        </section>

        {/* Hero */}
        <section aria-label="Hero">
          <Suspense
            fallback={
              <div className="mx-auto max-w-7xl px-4 py-10" aria-hidden="true">
                <div className="h-[280px] rounded-2xl bg-gray-100 animate-pulse" />
              </div>
            }
          >
            <Hero />
          </Suspense>
        </section>

        {/* Sales / featured promos */}
        <section aria-label="Featured deals">
          <Suspense
            fallback={
              <div className="mx-auto max-w-7xl px-4 pt-8" aria-hidden="true">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-40 rounded-xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              </div>
            }
          >
            <SalesCards items={promos} />
          </Suspense>
        </section>

        {/* Categories */}
        <section className="pt-10" aria-labelledby="shop-by-category">
          <div className="mx-auto max-w-7xl px-4">
            <h2 id="shop-by-category" className="text-center text-xl font-semibold text-slate-900 mb-6">
              Shop by Category
            </h2>

            <Suspense fallback={<div className="h-56 bg-gray-100 animate-pulse rounded-xl" aria-hidden="true" />}>
              <FeaturedCategories categories={featured} limit={3} />
            </Suspense>

            {/* Crawlable internal links (helps discovery even if components are heavy) */}
            <nav className="sr-only" aria-label="Featured category links">
              <ul>
                {featured.map((c) => (
                  <li key={c.slug}>
                    <a href={c.href}>{c.name}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </section>
      </main>
    </HomeShellClient>
  );
}
