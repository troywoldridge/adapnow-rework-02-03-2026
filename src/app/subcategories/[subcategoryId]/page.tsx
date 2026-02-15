// src/app/subcategories/[subcategoryId]/page.tsx
import "server-only";

import type { Metadata } from "next";
import Image from "@/components/ImageSafe";
import ProductGrid from "@/components/ProductGrid";
import { mergeProduct, mergeSubcategory } from "@/lib/mergeUtils";
import {
  getProductsBySubcategory,
  getSubcategoryDetails,
} from "@/lib/sinalite.server";

function readEnv(key: string): string | null {
  const v = process.env[key];
  if (!v) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function stripTrailingSlashes(s: string) {
  return s.replace(/\/+$/, "");
}

function joinUrl(base: string, p: string) {
  const b = stripTrailingSlashes(base);
  const path = p.startsWith("/") ? p : `/${p}`;
  return `${b}${path}`;
}

function getSiteBaseUrl(): string {
  return stripTrailingSlashes(
    readEnv("NEXT_PUBLIC_SITE_URL") || readEnv("SITE_URL") || "http://localhost:3000"
  );
}

function safeAbsoluteUrlMaybe(url: string | null | undefined, baseUrl: string): string | null {
  if (!url) return null;
  const s = String(url).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return joinUrl(baseUrl, s);
  return null;
}

function getCfImagesAccountHash(): string | null {
  return (
    readEnv("NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH") ||
    readEnv("CF_IMAGES_ACCOUNT_HASH") ||
    readEnv("CLOUDFLARE_IMAGES_ACCOUNT_HASH") ||
    null
  );
}

function getCfOgVariant(): string {
  return (
    readEnv("NEXT_PUBLIC_CF_OG_IMAGE_VARIANT") ||
    readEnv("CF_OG_IMAGE_VARIANT") ||
    "socialShare"
  );
}

function buildCfImagesUrl(imageId: string | null | undefined): string | null {
  const id = imageId ? String(imageId).trim() : "";
  if (!id) return null;
  const accountHash = getCfImagesAccountHash();
  if (!accountHash) return null;
  return `https://imagedelivery.net/${accountHash}/${id}/${getCfOgVariant()}`;
}

function getDefaultShareImageUrl(baseUrl: string): string | null {
  // Your envs:
  // DEFAULT_SOCIAL_SHARE_IMAGE_ID=...
  // NEXT_PUBLIC_CF_LOGO_ID=...
  const raw =
    readEnv("DEFAULT_SOCIAL_SHARE_IMAGE_ID") ||
    readEnv("NEXT_PUBLIC_DEFAULT_SOCIAL_SHARE_IMAGE_ID") ||
    readEnv("NEXT_PUBLIC_CF_LOGO_ID") ||
    null;

  // Support absolute URL or /path as an escape hatch.
  const maybeUrl = safeAbsoluteUrlMaybe(raw, baseUrl);
  if (maybeUrl) return maybeUrl;

  // Otherwise treat as Cloudflare Images ID.
  return buildCfImagesUrl(raw);
}

function getBrandName(): string {
  return readEnv("NEXT_PUBLIC_SITE_NAME") || "American Design And Printing";
}

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Minimal storefront product shape from SinaLite — id may be string or number */
type StorefrontProduct = {
  id: string | number;
  sku?: string;
  slug?: string;
  name?: string;
  description?: string;
  image?: string;
  [k: string]: any;
};

function getStoreCode(): string | undefined {
  // Prefer server-only env (safer), fall back to NEXT_PUBLIC for compatibility.
  return (
    readEnv("STORE_CODE") ||
    readEnv("SINALITE_STORE_CODE") ||
    readEnv("NEXT_PUBLIC_STORE_CODE") ||
    undefined
  );
}

/* ----------------------------- SEO ----------------------------- */
export async function generateMetadata({
  params,
}: {
  params: { subcategoryId: string };
}): Promise<Metadata> {
  const baseUrl = getSiteBaseUrl();
  const canonical = joinUrl(baseUrl, `/subcategories/${params.subcategoryId}`);

  const subId = toInt(params.subcategoryId);
  const storeCode = getStoreCode();

  const subFromMerge =
    subId !== null
      ? (mergeSubcategory({ id: subId }) as any)
      : (mergeSubcategory({ slug: params.subcategoryId }) as any);

  // Fetch SinaLite details (authoritative text) when ID numeric
  const fromSina =
    subId !== null ? await getSubcategoryDetails(subId, storeCode) : undefined;

  const name = subFromMerge?.name ?? fromSina?.name;
  const descriptionRaw = subFromMerge?.description ?? fromSina?.description ?? "";
  const description =
    (descriptionRaw || "").trim() || "Shop our print product lineup by subcategory.";

  const imageRaw = subFromMerge?.image ?? fromSina?.image;
  const pageImage =
    safeAbsoluteUrlMaybe(imageRaw, baseUrl) || getDefaultShareImageUrl(baseUrl);

  const title = name
    ? `${name} | Shop Print Products`
    : "Shop Print Products | American Design And Printing";

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    alternates: { canonical },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: getBrandName(),
      images: pageImage ? [{ url: pageImage }] : undefined,
    },
    twitter: {
      card: pageImage ? "summary_large_image" : "summary",
      title,
      description,
      images: pageImage ? [pageImage] : undefined,
    },
  };
}

/* ----------------------------- Page ----------------------------- */
export default async function SubcategoryProductsPage({
  params,
}: {
  params: { subcategoryId: string };
}) {
  const baseUrl = getSiteBaseUrl();
  const canonical = joinUrl(baseUrl, `/subcategories/${params.subcategoryId}`);

  const subId = toInt(params.subcategoryId);
  const storeCode = getStoreCode();

  if (subId === null) {
    const brandName = getBrandName();

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": joinUrl(baseUrl, "/#website"),
          url: baseUrl,
          name: brandName,
        },
        {
          "@type": "Organization",
          "@id": joinUrl(baseUrl, "/#organization"),
          name: brandName,
          url: baseUrl,
        },
        {
          "@type": "WebPage",
          "@id": canonical,
          url: canonical,
          name: "Invalid subcategory",
          isPartOf: { "@id": joinUrl(baseUrl, "/#website") },
          about: { "@id": joinUrl(baseUrl, "/#organization") },
        },
      ],
    };

    return (
      <main className="mx-auto max-w-6xl px-4 py-12 text-center">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <h1 className="text-xl font-bold text-red-600">Invalid subcategory</h1>
        <p className="mt-2 text-neutral-700">
          We couldn’t recognize that subcategory.
        </p>
      </main>
    );
  }

  // Merge local (for asset image mapping) + SinaLite (authoritative text)
  const local = mergeSubcategory({ id: subId }) as any;
  const sina = await getSubcategoryDetails(subId, storeCode);

  const subName = local?.name ?? sina?.name ?? "Products";
  const subDesc = (local?.description ?? sina?.description ?? "").trim();
  const subImageRaw = local?.image ?? sina?.image;
  const subImage = safeAbsoluteUrlMaybe(subImageRaw, baseUrl);

  // Products from SinaLite, then merged for local image ids/attrs if any
  const rawProducts = (await getProductsBySubcategory(
    subId,
    storeCode
  )) as StorefrontProduct[];

  const products = rawProducts.map((apiProd: StorefrontProduct) => {
    const idNum =
      typeof apiProd.id === "string" ? Number(apiProd.id) : Number(apiProd.id);

    const safeProd = {
      ...apiProd,
      id: Number.isFinite(idNum) ? idNum : undefined, // mergeProduct expects numeric id | undefined
    };

    return mergeProduct(safeProd as any);
  });

  // JSON-LD: CollectionPage + ItemList (best-effort)
  const brandName = getBrandName();
  const itemListElements = (products as any[]).slice(0, 200).map((p, idx) => {
    const name = String(p?.name || p?.title || p?.sku || "Product");
    const sku = p?.sku ? String(p.sku) : undefined;

    // Try common URL fields; fall back to nothing if unknown
    const hrefRaw = p?.href || p?.url || (p?.slug ? `/products/${p.slug}` : null);
    const url = hrefRaw ? safeAbsoluteUrlMaybe(hrefRaw, baseUrl) : null;

    return {
      "@type": "ListItem",
      position: idx + 1,
      ...(url ? { url } : {}),
      name,
      ...(sku ? { identifier: sku } : {}),
    };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": joinUrl(baseUrl, "/#website"),
        url: baseUrl,
        name: brandName,
      },
      {
        "@type": "Organization",
        "@id": joinUrl(baseUrl, "/#organization"),
        name: brandName,
        url: baseUrl,
      },
      {
        "@type": "CollectionPage",
        "@id": canonical,
        url: canonical,
        name: subName,
        description: subDesc || undefined,
        isPartOf: { "@id": joinUrl(baseUrl, "/#website") },
        about: { "@id": joinUrl(baseUrl, "/#organization") },
        mainEntity: {
          "@type": "ItemList",
          itemListOrder: "https://schema.org/ItemListOrderAscending",
          numberOfItems: Array.isArray(products) ? products.length : undefined,
          itemListElement: itemListElements,
        },
      },
    ],
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Subcategory hero */}
      <section className="mb-8 rounded-2xl border bg-white p-6 shadow-sm ring-1 ring-black/5">
        {subImage && (
          <div className="overflow-hidden rounded-xl border">
            <Image
              src={subImage}
              alt={subName}
              width={1200}
              height={320}
              className="h-auto w-full object-cover"
              priority
              unoptimized
            />
          </div>
        )}

        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{subName}</h1>
        {!!subDesc && (
          <p className="mt-2 max-w-3xl text-sm text-neutral-700">{subDesc}</p>
        )}
      </section>

      <ProductGrid products={products as any[]} />
    </main>
  );
}
