import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";

import {
  getSinaliteProductMeta,
  getSinaliteProductArrays,
  normalizeOptionGroups,
  getDefaultPriceSnapshot,
} from "@/lib/sinalite.client";

import ProductBuyBox from "@/components/product/ProductBuyBox";
import ProductInfoTabs from "@/components/product/ProductInfoTabs";
import ProductGallery from "@/components/product/ProductGallery";
import MobileAddToCartBar from "@/components/product/MobileAddToCartBar";

import categoryAssets from "@/data/categoryAssets.json";
import subcategoryAssets from "@/data/subcategoryAssets.json";
import productAssets from "@/data/productAssets.json";
import { cfImage, type Variant as CfVariant } from "@/lib/cfImages";

/* ---------------- Types ---------------- */
type Category = { id?: number | string | null; slug: string; name?: string | null };
type Subcategory = {
  id?: number | string | null;
  subcategory_id?: number | string | null;
  category_id?: number | string | null;
  category_slug?: string | null;
  slug?: string | null;
  name: string;
  description?: string | null;
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
  ["slugs (products)"]?: string | null;
  description?: string | null;
  cf_image_1_id?: string | null;
  cf_image_2_id?: string | null;
  cf_image_3_id?: string | null;
  cf_image_4_id?: string | null;
  [k: string]: any;
};

type BBGroup = { name: string; options: { id: number; name: string }[] };

/* ---------------- Site ---------------- */
const SITE_NAME = "American Design And Printing";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://adapnow.com").trim().replace(/\/+$/, "");
const METADATA_BASE = SITE_URL ? new URL(SITE_URL) : undefined;

function absUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export const viewport: Viewport = { themeColor: "#0f172a" };

/* ---------------- Utils ---------------- */
const V = (v: string) => v as unknown as CfVariant;

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
  return (s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ensureSubSlug(s: Subcategory): string {
  const id = toNum(s.subcategory_id) ?? toNum(s.id);
  return (s.slug && s.slug.trim()) || toSlug(s.name) || (id ? `sub-${id}` : "subcategory");
}

/** Prefer productAssets JSON slugs first; fall back to name/sku slugified */
function productSlugFromRow(p: ProductRow): string {
  const cands = [
    p.slug,
    p.product_slug,
    p["slugs (products)"],
    p.name ? toSlug(p.name) : "",
    p.sku ? toSlug(p.sku) : "",
    p.id != null ? String(p.id) : "",
  ].map((x) => (x ?? "").toString().trim());

  return cands.find(Boolean) || "";
}

function slugCandidatesForRow(p: ProductRow): string[] {
  const candRaw = [
    p.slug,
    p.product_slug,
    (p as any)["slugs (products)"],
    p.name ? toSlug(p.name) : "",
    p.sku ? toSlug(p.sku) : "",
  ].map((x) => (x ?? "").toString().trim());

  const set = new Set<string>();
  for (const c of candRaw) {
    const s = c.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (s) set.add(s);
  }
  return Array.from(set);
}

function findProductByAnySlug(all: ProductRow[], productSlug: string): ProductRow | null {
  const target = toSlug(productSlug);
  const direct = all.find((p) => slugCandidatesForRow(p).includes(target));
  if (direct) return direct;

  const loose = all.find((p) => {
    const cands = slugCandidatesForRow(p);
    return cands.some((c) => c === target || c.replace(/-+/g, "") === target.replace(/-+/g, ""));
  });
  return loose ?? null;
}

function allImageIds(p: ProductRow): string[] {
  return [p.cf_image_1_id, p.cf_image_2_id, p.cf_image_3_id, p.cf_image_4_id]
    .map((x) => (x ?? "").trim())
    .filter(Boolean) as string[];
}

function buildPath(categorySlug: string, subcategorySlug: string, productSlug: string) {
  return `/categories/${categorySlug}/${subcategorySlug}/${productSlug}`;
}

/** Friendly sub label for pages like /sub-30 when assets don’t name it */
function deriveFriendlySubLabel(products: ProductRow[], categorySlug: string, fallback: string): string {
  const counts = new Map<string, number>();
  for (const p of products) {
    const sc = (p.subcategory_slug || "").trim();
    let label = sc
      ? titleCase(sc)
      : (() => {
          const base = (p.slug || p.product_slug || p.name || "").toString().toLowerCase();
          const pref = `${categorySlug}-`;
          const rest = base.startsWith(pref) ? base.slice(pref.length) : base;
          const parts = rest.split(/[-\s]+/).filter(Boolean);
          return titleCase(parts.slice(0, Math.min(3, parts.length)).join(" ") || fallback);
        })();
    label = label || fallback;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  if (counts.size === 0) return titleCase(fallback);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/* ---------------- SEO ---------------- */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ categorySlug: string; subcategorySlug: string; productSlug: string }>;
}): Promise<Metadata> {
  const { categorySlug, subcategorySlug, productSlug } = await params;

  const cats = categoryAssets as Category[];
  const subs = subcategoryAssets as Subcategory[];
  const prods = productAssets as ProductRow[];

  const product = findProductByAnySlug(prods, productSlug);
  if (!product) return { title: "Product Not Found", robots: { index: false, follow: false } };

  const cat =
    cats.find((c) => c.slug === (product.category_slug || "").trim()) ||
    cats.find((c) => c.slug === categorySlug);

  const readableCat = titleCase(cat?.name ?? categorySlug);

  const sub =
    subs.find((s) => ensureSubSlug(s) === (product.subcategory_slug || "").trim()) ||
    subs.find((s) => {
      const sameCat = (s.category_slug || "").trim() === (product.category_slug || "").trim();
      const sameId =
        toNum(s.subcategory_id) === toNum(product.subcategory_id) ||
        toNum(s.id) === toNum(product.subcategory_id);
      return sameCat && sameId;
    });

  const fallbackSubLabel = subcategorySlug.startsWith("sub-") ? `Sub ${subcategorySlug.slice(4)}` : subcategorySlug;
  const inThisCat = prods.filter(
    (p) =>
      (p.category_slug || "").trim() === (product.category_slug || "").trim() ||
      (toNum(p.category_id) ?? NaN) === (toNum(product.category_id) ?? NaN)
  );
  const friendlySub = titleCase(sub?.name ?? deriveFriendlySubLabel(inThisCat, categorySlug, fallbackSubLabel));

  const idStr =
    product.sinalite_id != null ? String(product.sinalite_id) : product.id != null ? String(product.id) : null;

  let metaTitle = titleCase(product.name || productSlug.replace(/[-_]+/g, " "));
  let metaDesc = product.description || `Configure ${metaTitle} with live options and pricing from ${SITE_NAME}.`;

  try {
    if (idStr) {
      const m = await getSinaliteProductMeta(idStr);
      if (m?.name) metaTitle = String(m.name);
      if (m?.description) metaDesc = String(m.description);
    }
  } catch {
    // keep defaults
  }

  const canonicalPath = buildPath(categorySlug, subcategorySlug, productSlug);
  const canonicalAbs = absUrl(canonicalPath);

  const firstImgId = allImageIds(product)[0];
  const ogImg = firstImgId ? cfImage(firstImgId, V("productHero")) : undefined;

  const ogImages = ogImg ? [{ url: ogImg }] : undefined;

  return {
    metadataBase: METADATA_BASE,
    title: {
      default: `${metaTitle} • ${friendlySub} | ${SITE_NAME}`,
      template: `%s | ${SITE_NAME}`,
    },
    description: metaDesc,
    alternates: { canonical: canonicalPath },
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
      url: canonicalAbs,
      title: metaTitle,
      description: metaDesc,
      siteName: SITE_NAME,
      images: ogImages,
    },
    twitter: {
      card: ogImg ? "summary_large_image" : "summary",
      title: metaTitle,
      description: metaDesc,
      images: ogImg ? [ogImg] : undefined,
    },
  };
}

/* ---------------- PAGE ---------------- */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ categorySlug: string; subcategorySlug: string; productSlug: string }>;
}) {
  const { categorySlug, subcategorySlug, productSlug } = await params;

  const cats = categoryAssets as Category[];
  const subs = subcategoryAssets as Subcategory[];
  const prods = productAssets as ProductRow[];

  const prodRow = findProductByAnySlug(prods, productSlug);
  if (!prodRow) return notFound();

  const cat =
    cats.find((c) => c.slug === (prodRow.category_slug || "").trim()) ||
    cats.find((c) => c.slug === categorySlug);
  const readableCat = titleCase(cat?.name ?? categorySlug);

  const sub =
    subs.find((s) => ensureSubSlug(s) === (prodRow.subcategory_slug || "").trim()) ||
    subs.find((s) => {
      const sameCat = (s.category_slug || "").trim() === (prodRow.category_slug || "").trim();
      const sameId =
        toNum(s.subcategory_id) === toNum(prodRow.subcategory_id) || toNum(s.id) === toNum(prodRow.subcategory_id);
      return sameCat && sameId;
    });

  const fallbackSubLabel = subcategorySlug.startsWith("sub-") ? `Sub ${subcategorySlug.slice(4)}` : subcategorySlug;
  const inThisCat = prods.filter(
    (p) =>
      (p.category_slug || "").trim() === (prodRow.category_slug || "").trim() ||
      (toNum(p.category_id) ?? NaN) === (toNum(prodRow.category_id) ?? NaN)
  );
  const friendlySub = titleCase(sub?.name ?? deriveFriendlySubLabel(inThisCat, categorySlug, fallbackSubLabel));

  // Gallery via Cloudflare CDN
  const ids = allImageIds(prodRow);
  const fallbackCfId = "a90ba357-76ea-48ed-1c65-44fff4401600";

  const gallery: string[] =
    ids.length > 0
      ? (ids
          .map((id, i) => cfImage(id, V(i === 0 ? "productHero" : "productCard")))
          .filter((u): u is string => !!u) as string[])
      : ([cfImage(fallbackCfId, V("productHero"))].filter((u): u is string => !!u) as string[]);

  const productName =
    prodRow.name && String(prodRow.name).trim()
      ? String(prodRow.name).trim()
      : titleCase(productSlug.replace(/[-_]+/g, " "));

  const heroCfId = ids[0] || fallbackCfId;

  // SinaLite ID (for live options & pricing)
  const sinaliteIdStr =
    prodRow.sinalite_id != null ? String(prodRow.sinalite_id) : prodRow.id != null ? String(prodRow.id) : null;

  if (!sinaliteIdStr) return notFound();

  const sinaliteIdNum = Number(sinaliteIdStr);
  if (!Number.isFinite(sinaliteIdNum) || sinaliteIdNum <= 0) return notFound();

  // Options + arrays (per SinaLite API docs)
  const arrays = await getSinaliteProductArrays(sinaliteIdStr).catch(() => null);
  const optionsArray: any[] = (arrays?.optionsArray ?? []) as any[];
  const normalized: any[] = Array.isArray(optionsArray) ? (normalizeOptionGroups(optionsArray) as any[]) : [];

  // buyBoxGroups with numeric IDs + normalized group names
  const buyBoxGroups: BBGroup[] = (() => {
    const out: BBGroup[] = [];

    for (const g of normalized) {
      const rawName = String(g?.name ?? g?.groupName ?? g?.label ?? g?.title ?? "").trim();
      if (!rawName) continue;

      const lname = rawName.toLowerCase();
      const gName = lname.includes("qty") || lname.includes("quantity") ? "Quantity" : rawName;

      const raw =
        Array.isArray(g?.options) ? g.options : Array.isArray(g?.values) ? g.values : Array.isArray(g?.items) ? g.items : [];

      const options = raw
        .map((o: any) => {
          const idNum = Number(o?.valueId ?? o?.optionId ?? o?.id ?? o?.value ?? o?.code);
          if (!Number.isFinite(idNum) || idNum <= 0) return null;
          const label = String(o?.name ?? o?.label ?? o?.valueName ?? o?.title ?? idNum).trim();
          if (!label) return null;
          return { id: idNum, name: label };
        })
        .filter(Boolean) as BBGroup["options"];

      if (options.length) out.push({ name: gName, options });
    }

    return out;
  })();

  // Meta for details/file prep
  let meta: any = null;
  try {
    meta = await getSinaliteProductMeta(sinaliteIdStr);
  } catch {
    // ignore
  }

  // Starting price snapshot
  let startingPriceDisplay: string | undefined;
  let startingPriceValue: number | undefined;
  let startingCurrency: string | undefined;

  try {
    const snap = await getDefaultPriceSnapshot(sinaliteIdNum);
    const price = (snap as any)?.price;
    const currency = (snap as any)?.currency || "USD";
    if (typeof price === "number" && Number.isFinite(price) && price >= 0) {
      startingPriceValue = price;
      startingCurrency = String(currency);
      startingPriceDisplay = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: startingCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(startingPriceValue);
    }
  } catch {
    // ignore
  }

  const productDescription =
    meta?.description && String(meta.description).trim()
      ? String(meta.description).trim()
      : prodRow.description && String(prodRow.description).trim()
        ? String(prodRow.description).trim()
        : `Configure ${productName} with live options and pricing from ${SITE_NAME}.`;

  // Panels for tabs
  const detailsPanel = (
    <div className="not-prose">
      {productDescription ? <p className="text-sm text-gray-700 max-w-3xl">{productDescription}</p> : null}
      <dl className="mt-4 grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="font-medium text-gray-900">Paper Type</dt>
          <dd className="text-gray-700">{meta?.paperType ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-900">Coating</dt>
          <dd className="text-gray-700">{meta?.coating ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-900">Color</dt>
          <dd className="text-gray-700">{meta?.color ?? "Full color CMYK"}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-900">Finishing</dt>
          <dd className="text-gray-700">{meta?.finishing ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-900">File Type</dt>
          <dd className="text-gray-700">{meta?.fileType ?? "Print Ready PDF"}</dd>
        </div>
      </dl>
    </div>
  );

  const filePrepPanel = meta?.filePrep ? (
    // eslint-disable-next-line react/no-danger
    <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: String(meta.filePrep) }} />
  ) : (
    <div className="space-y-3 text-sm text-gray-700">
      <ul className="list-disc pl-5 space-y-1">
        <li>Use CMYK color, 300 DPI (minimum).</li>
        <li>Keep text 1/8″ inside safe margins.</li>
        <li>Include 1/8″ bleed on all sides (unless large format).</li>
        <li>Preferred file type: print-ready PDF.</li>
      </ul>
      <Link
        href="/guides"
        className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
      >
        View file setup guides
      </Link>
    </div>
  );

  // JSON-LD
  const canonicalPath = buildPath(categorySlug, subcategorySlug, productSlug);
  const canonicalAbs = absUrl(canonicalPath);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: readableCat, item: absUrl(`/categories/${categorySlug}`) },
      { "@type": "ListItem", position: 3, name: friendlySub, item: absUrl(`/categories/${categorySlug}/${subcategorySlug}`) },
      { "@type": "ListItem", position: 4, name: productName, item: canonicalAbs },
    ],
  };

  const primaryImage = cfImage(heroCfId, V("productHero"));
  const productJsonLd: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    description: productDescription,
    sku: prodRow.sku || undefined,
    brand: { "@type": "Brand", name: SITE_NAME },
    image: primaryImage ? [primaryImage] : undefined,
    url: canonicalAbs,
  };

  if (startingPriceValue != null && startingCurrency) {
    productJsonLd.offers = {
      "@type": "Offer",
      url: canonicalAbs,
      priceCurrency: startingCurrency,
      price: startingPriceValue,
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: SITE_NAME },
    };
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 pb-28 md:pb-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />

      <nav className="mb-5 text-sm text-gray-600" aria-label="Breadcrumb">
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
          <li>
            <Link className="hover:underline" href={`/categories/${categorySlug}/${subcategorySlug}`}>
              {friendlySub}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-gray-900 font-medium">
            {productName}
          </li>
        </ol>
      </nav>

      <header className="mb-3">
        <h1 className="text-2xl md:text-3xl font-semibold">{productName}</h1>
        {productDescription ? <p className="mt-2 max-w-2xl text-gray-600">{productDescription}</p> : null}
      </header>

      <section
        className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,720px)_minmax(0,460px)]"
        aria-label="Product content"
      >
        <div>
          <ProductGallery images={gallery} productName={productName} />
          <ProductInfoTabs
            details={detailsPanel}
            filePrep={filePrepPanel}
            reviewsProductId={sinaliteIdStr}
            reviewsProductName={productName}
          />
        </div>

        <aside className="lg:sticky lg:top-24 h-fit" id="buy-box" aria-label="Purchase options">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Price this item</h2>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1">
                ✅ <span>Trade-only pricing</span>
              </span>
              <span aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1">
                �� <span>Fast turnaround</span>
              </span>
              <span aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1">
                💬 <span>Real support</span>
              </span>
            </div>

            <ProductBuyBox
              productId={sinaliteIdNum}
              productName={productName}
              optionGroups={buyBoxGroups}
              store="US"
              cloudflareImageId={heroCfId}
            />

            <div className="mt-3 text-xs text-gray-600">
              {startingPriceDisplay ? (
                <>
                  From <strong>{startingPriceDisplay}</strong>
                </>
              ) : (
                <>Live pricing</>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-gray-600">
            <div className="rounded-lg border p-3">🔒 Secure Checkout</div>
            <div className="rounded-lg border p-3">📦 Real-time Tracking</div>
            <div className="rounded-lg border p-3">✅ Quality Guaranteed</div>
          </div>
        </aside>
      </section>

      <MobileAddToCartBar productName={productName} startingPrice={startingPriceDisplay} targetId="buy-box" />
    </main>
  );
}
