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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type BuyBoxOption = { id: number; name: string };
type BuyBoxOptionGroup = { name: string; options: BuyBoxOption[] };

/* ---------------- Site ---------------- */
const SITE_NAME = "American Design And Printing";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://adapnow.com").trim().replace(/\/+$/, "");
const METADATA_BASE = SITE_URL ? new URL(SITE_URL) : undefined;

export const viewport: Viewport = { themeColor: "#0f172a" };

function absUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/* ---------------- Utils ---------------- */
const V = (v: string) => v as unknown as CfVariant;

function toNum(n: unknown): number | null {
  const s = n == null ? "" : String(n).trim();
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function toSlug(s?: string | null): string {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function titleCase(s?: string | null): string {
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

function allImageIds(p: ProductRow): string[] {
  const ids = [p.cf_image_1_id, p.cf_image_2_id, p.cf_image_3_id, p.cf_image_4_id]
    .map((x) => (x ?? "").toString().trim())
    .filter(Boolean) as string[];
  return Array.from(new Set(ids));
}

/** Robust slug candidates for products (assets-driven) */
function slugCandidatesForRow(p: ProductRow): string[] {
  const candRaw = [
    p.slug,
    p.product_slug,
    (p as any)["slugs (products)"],
    p.name ? toSlug(p.name) : "",
    p.sku ? toSlug(p.sku) : "",
    p.id != null ? String(p.id) : "",
    p.sinalite_id != null ? String(p.sinalite_id) : "",
  ].map((x) => (x ?? "").toString().trim());

  const set = new Set<string>();
  for (const c of candRaw) {
    const s = toSlug(c);
    if (s) set.add(s);
  }
  return Array.from(set);
}

/** Find product by /products/[productId] where productId may be DB id, sinalite id, or slug-ish */
function findProductByProductId(all: ProductRow[], productId: string): ProductRow | null {
  const raw = String(productId || "").trim();
  if (!raw) return null;

  // 1) numeric match against id / sinalite_id (string-safe)
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) {
    const hitNum = all.find((p) => Number(p.sinalite_id) === asNum || Number(p.id) === asNum);
    if (hitNum) return hitNum;
  }

  // 2) slug-ish match against candidates
  const target = toSlug(raw);
  const direct = all.find((p) => slugCandidatesForRow(p).includes(target));
  if (direct) return direct;

  // 3) looser match (strip dashes)
  const t2 = target.replace(/-+/g, "");
  const loose = all.find((p) => slugCandidatesForRow(p).some((c) => c.replace(/-+/g, "") === t2));
  return loose ?? null;
}

function toBuyBoxGroups(groups: any[]): BuyBoxOptionGroup[] {
  const src = Array.isArray(groups) ? groups : [];
  const out: BuyBoxOptionGroup[] = [];

  for (const g of src) {
    const rawName = String(g?.name ?? g?.groupName ?? g?.label ?? g?.title ?? "").trim();
    if (!rawName) continue;

    const lname = rawName.toLowerCase();
    const groupName = lname.includes("qty") || lname.includes("quantity") ? "Quantity" : rawName;

    const rawItems: unknown[] =
      Array.isArray(g?.options) ? g.options :
      Array.isArray(g?.values) ? g.values :
      Array.isArray(g?.items) ? g.items :
      Array.isArray(g?.choices) ? g.choices : [];

    const options = rawItems
      .map((o: any) => {
        const idCandidate = o?.id ?? o?.valueId ?? o?.optionId ?? o?.value ?? o?.code ?? o?.key;
        const idNum = Number(idCandidate);
        if (!Number.isFinite(idNum) || idNum <= 0) return null;

        const name = String(o?.name ?? o?.label ?? o?.valueName ?? o?.title ?? o?.text ?? idCandidate ?? "").trim();
        if (!name) return null;

        return { id: idNum, name };
      })
      .filter(Boolean) as BuyBoxOption[];

    if (options.length) out.push({ name: groupName, options });
  }

  return out;
}

/* ---------------- SEO ---------------- */
export async function generateMetadata({
  params,
}: {
  params: { productId: string };
}): Promise<Metadata> {
  const { productId } = params;

  const cats = categoryAssets as Category[];
  const subs = subcategoryAssets as Subcategory[];
  const prods = productAssets as ProductRow[];

  const product = findProductByProductId(prods, productId);
  if (!product) return { title: "Product Not Found", robots: { index: false, follow: false } };

  const cat =
    cats.find((c) => (c.slug || "").trim() === (product.category_slug || "").trim()) ||
    (product.category_id != null ? cats.find((c) => toNum(c.id) === toNum(product.category_id)) : undefined);

  const sub =
    subs.find((s) => ensureSubSlug(s) === (product.subcategory_slug || "").trim()) ||
    subs.find((s) => {
      const sameCat =
        ((s.category_slug || "").trim() === (product.category_slug || "").trim()) ||
        (toNum(s.category_id) === toNum(product.category_id));
      const sameId =
        toNum(s.subcategory_id) === toNum(product.subcategory_id) ||
        toNum(s.id) === toNum(product.subcategory_id);
      return sameCat && sameId;
    });

  const readableCat = titleCase(cat?.name ?? product.category_slug ?? "Products");
  const friendlySub = titleCase(sub?.name ?? product.subcategory_slug ?? "Product");

  // Enrich from SinaLite if possible (best-effort)
  const sinaliteIdStr =
    product.sinalite_id != null ? String(product.sinalite_id) :
    product.id != null ? String(product.id) : null;

  let metaTitle = titleCase(product.name || product.sku || productId);
  let metaDesc =
    (product.description && String(product.description).trim()) ||
    `Configure ${metaTitle} with live options and pricing from ${SITE_NAME}.`;

  try {
    if (sinaliteIdStr) {
      const m = await getSinaliteProductMeta(sinaliteIdStr);
      if (m?.name) metaTitle = String(m.name);
      if (m?.description) metaDesc = String(m.description);
    }
  } catch {
    // keep defaults
  }

  const canonicalPath = `/products/${encodeURIComponent(productId)}`;
  const canonicalAbs = absUrl(canonicalPath);
  const title = `${product.name} | ${SITE_NAME}`;
  const description = product.shortDescription ?? product.description ?? `Buy ${product.name} online.`;

  const firstImgId = allImageIds(product)[0];
  const ogImg = firstImgId ? cfImage(firstImgId, V("productHero")) : undefined;

  return {
    metadataBase: METADATA_BASE,
    title: `${metaTitle} | ${SITE_NAME}`,
    description: metaDesc,
    alternates: { canonical: canonicalPath },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 },
    },
openGraph: {
  type: "website",
  title,
  description,
  url: canonicalAbs,
  siteName: SITE_NAME,
  images: ogImg ? [ogImg] : undefined,
},
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDesc,
      images: ogImg ? [ogImg] : undefined,
    },
    keywords: [
      metaTitle,
      friendlySub,
      readableCat,
      "trade printing",
      "wholesale printing",
      "custom print",
      "online printing",
      "fast turnaround",
    ],
  };
}

/* ---------------- PAGE ---------------- */
export default async function ProductPage({
  params,
}: {
  params: { productId: string };
}) {
  const { productId } = params;

  const cats = categoryAssets as Category[];
  const subs = subcategoryAssets as Subcategory[];
  const prods = productAssets as ProductRow[];

  const prodRow = findProductByProductId(prods, productId);
  if (!prodRow) return notFound();

  const cat =
    cats.find((c) => (c.slug || "").trim() === (prodRow.category_slug || "").trim()) ||
    (prodRow.category_id != null ? cats.find((c) => toNum(c.id) === toNum(prodRow.category_id)) : undefined);

  const sub =
    subs.find((s) => ensureSubSlug(s) === (prodRow.subcategory_slug || "").trim()) ||
    subs.find((s) => {
      const sameCat =
        ((s.category_slug || "").trim() === (prodRow.category_slug || "").trim()) ||
        (toNum(s.category_id) === toNum(prodRow.category_id));
      const sameId =
        toNum(s.subcategory_id) === toNum(prodRow.subcategory_id) ||
        toNum(s.id) === toNum(prodRow.subcategory_id);
      return sameCat && sameId;
    });

  const readableCat = titleCase(cat?.name ?? prodRow.category_slug ?? "Products");
  const catSlug = (cat?.slug || prodRow.category_slug || "").trim();

  const friendlySub = titleCase(sub?.name ?? prodRow.subcategory_slug ?? "Product");
  const subSlug = sub ? ensureSubSlug(sub) : (prodRow.subcategory_slug ? toSlug(prodRow.subcategory_slug) : "");

  /* ---------- SinaLite ID (one place) ---------- */
  const sinaliteIdStr =
    prodRow.sinalite_id != null ? String(prodRow.sinalite_id) :
    prodRow.id != null ? String(prodRow.id) : null;

  if (!sinaliteIdStr) return notFound();

  const sinaliteIdNum = Number(sinaliteIdStr);
  if (!Number.isFinite(sinaliteIdNum) || sinaliteIdNum <= 0) return notFound();

  /* ---------- Live meta + options ---------- */
  let meta: any = null;
  try {
    meta = await getSinaliteProductMeta(sinaliteIdStr);
  } catch {
    // ignore
  }

  const arrays = await getSinaliteProductArrays(sinaliteIdStr).catch(() => null);
  const optionsArray: any[] = (arrays?.optionsArray ?? []) as any[];
  const normalized: any[] = Array.isArray(optionsArray) ? (normalizeOptionGroups(optionsArray) as any[]) : [];
  const buyBoxGroups: BuyBoxOptionGroup[] = toBuyBoxGroups(normalized);

  /* ---------- Cloudflare gallery ---------- */
  const ids = allImageIds(prodRow);
  const fallbackCfId = "a90ba357-76ea-48ed-1c65-44fff4401600";
  const heroCfId = ids[0] || fallbackCfId;

  const gallery: string[] =
    ids.length > 0
      ? (ids
          .map((id, i) => cfImage(id, V(i === 0 ? "productHero" : "productCard")))
          .filter((u): u is string => !!u) as string[])
      : ([cfImage(fallbackCfId, V("productHero"))].filter((u): u is string => !!u) as string[]);

  const productName =
    (meta?.name && String(meta.name).trim())
      ? String(meta.name).trim()
      : (prodRow.name && String(prodRow.name).trim())
        ? String(prodRow.name).trim()
        : titleCase(prodRow.sku || productId);

  const productDescription =
    (meta?.description && String(meta.description).trim())
      ? String(meta.description).trim()
      : (prodRow.description && String(prodRow.description).trim())
        ? String(prodRow.description).trim()
        : `Configure ${productName} with live options and pricing from ${SITE_NAME}.`;

  /* ---------- Price snapshot (best effort) ---------- */
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

  /* ---------- Tabs ---------- */
  const detailsPanel = (
    <div className="not-prose">
      <p className="text-sm text-gray-700 max-w-3xl">{productDescription}</p>

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

  /* ---------- JSON-LD ---------- */
  const canonicalPath = `/products/${encodeURIComponent(productId)}`;
  const canonicalAbs = absUrl(canonicalPath);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      ...(catSlug ? [{ "@type": "ListItem", position: 2, name: readableCat, item: absUrl(`/categories/${catSlug}`) }] : []),
      ...(catSlug && subSlug ? [{ "@type": "ListItem", position: 3, name: friendlySub, item: absUrl(`/categories/${catSlug}/${subSlug}`) }] : []),
      { "@type": "ListItem", position: catSlug && subSlug ? 4 : catSlug ? 3 : 2, name: productName, item: canonicalAbs },
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

      {/* Breadcrumbs */}
      <nav className="mb-5 text-sm text-gray-600" aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link className="hover:underline" href="/">Home</Link></li>

          {catSlug ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link className="hover:underline" href={`/categories/${catSlug}`}>
                  {readableCat}
                </Link>
              </li>
            </>
          ) : null}

          {catSlug && subSlug ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link className="hover:underline" href={`/categories/${catSlug}/${subSlug}`}>
                  {friendlySub}
                </Link>
              </li>
            </>
          ) : null}

          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-gray-900 font-medium">{productName}</li>
        </ol>
      </nav>

      <header className="mb-3">
        <h1 className="text-2xl md:text-3xl font-semibold">{productName}</h1>
        {productDescription ? <p className="mt-2 max-w-2xl text-gray-600">{productDescription}</p> : null}
      </header>

      <section className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,720px)_minmax(0,460px)]" aria-label="Product content">
        {/* LEFT */}
        <div>
          <ProductGallery images={gallery} productName={productName} />
          <ProductInfoTabs
            details={detailsPanel}
            filePrep={filePrepPanel}
            reviewsProductId={sinaliteIdStr}
            reviewsProductName={productName}
          />
        </div>

        {/* RIGHT */}
        <aside className="lg:sticky lg:top-24 h-fit" id="buy-box" aria-label="Purchase options">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Price this item</h2>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1">✅ <span>Trade-only pricing</span></span>
              <span aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1">🚚 <span>Fast turnaround</span></span>
              <span aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1">💬 <span>Real support</span></span>
            </div>

            <ProductBuyBox
              productId={sinaliteIdNum}
              productName={productName}
              optionGroups={buyBoxGroups}
              store="US"
              cloudflareImageId={heroCfId}
            />

            <div className="mt-3 text-xs text-gray-600">
              {startingPriceDisplay ? <>From <strong>{startingPriceDisplay}</strong></> : <>Live pricing</>}
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
