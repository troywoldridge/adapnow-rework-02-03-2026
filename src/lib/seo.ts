// src/lib/seo.ts
import type { Metadata } from "next";
import { cfUrl } from "@/lib/data";

const SITE =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "") ||
  "http://localhost:3000";

const STORE = (process.env.NEXT_PUBLIC_STORE_CODE ?? "en_us").trim();
const CURRENCY = STORE.toLowerCase().includes("us") ? "USD" : "CAD";

function trimSlashes(s: string) {
  return s.replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE}${p}`;
}

export function baseMetadata(): Metadata {
  const siteName = "ADAP Print";

  return {
    metadataBase: new URL(SITE),
    alternates: { canonical: SITE },
    openGraph: {
      siteName,
      type: "website",
      locale: "en_US",
      url: SITE,
    },
    twitter: { card: "summary_large_image" },
  };
}

/** Organization + Website JSON-LD */
export function orgAndSiteJsonLd() {
  const ogId = (process.env.DEFAULT_SOCIAL_SHARE_IMAGE_ID ?? "").trim(); // may be ""
  // Prefer Cloudflare Images URL; fall back to a local absolute logo (make sure it exists)
  const fallbackLogo = `${SITE}/favicon-32x32.png`;
  const logoUrl = ogId ? cfUrl(ogId) : fallbackLogo;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}#org`,
        name: "ADAP Print",
        url: SITE,
        // Always a string; avoids undefined fields in JSON-LD.
        logo: logoUrl,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}#website`,
        url: SITE,
        name: "ADAP Print",
        publisher: { "@id": `${SITE}#org` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export type ProductJsonLdOffer = {
  price: number;
  currency?: string;
  availability?: string; // schema.org URL
} | null;

export function productJsonLd(opts: {
  id: string | number;
  name: string;
  description?: string | null;
  images: string[];
  sku?: string | null;
  brand?: string;
  url: string;
  category?: string;
  offer?: ProductJsonLdOffer;
}) {
  const availability = opts.offer?.availability || "https://schema.org/InStock";
  const currency = opts.offer?.currency || CURRENCY;

  // Build without "undefined" fields (cleaner JSON-LD).
  const json: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${trimSlashes(opts.url)}#product`,
    name: opts.name,
    description: opts.description || "",
    url: opts.url,
  };

  if (opts.images?.length) json.image = opts.images;
  if (opts.sku) json.sku = opts.sku;
  if (opts.category) json.category = opts.category;
  if (opts.brand) json.brand = { "@type": "Brand", name: opts.brand };

  // IMPORTANT: allow price=0 if you ever need it; check number-ness, not truthiness.
  const price = opts.offer?.price;
  if (typeof price === "number" && Number.isFinite(price)) {
    json.offers = {
      "@type": "Offer",
      price,
      priceCurrency: currency,
      availability,
      url: opts.url,
    };
  }

  return json;
}
