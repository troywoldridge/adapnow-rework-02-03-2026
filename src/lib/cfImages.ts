// src/lib/cfImages.ts
// Cloudflare Images helpers (served by Cloudflare CDN).
// Supports multiple env var names so legacy builds still work.
//
// NOTE: This module is intentionally client-safe. It reads NEXT_PUBLIC_* envs,
// which are compiled into the client bundle by Next.js.

type Params = Record<string, string | number | boolean | null | undefined>;

function readFirst(keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = (process.env as Record<string, string | undefined>)[k];
    if (v && v.trim()) return v.trim();
  }
  return fallback;
}

export const CF_HASH = readFirst(
  [
    "NEXT_PUBLIC_CF_ACCOUNT_HASH", // preferred
    "NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH", // legacy alt
    "NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH",
    "NEXT_PUBLIC_CLOUDFLARE_ACCOUNT_HASH",
    "CF_IMAGES_ACCOUNT_HASH",
  ],
  "",
);

export const CF_BASE = readFirst(
  [
    "NEXT_PUBLIC_IMAGE_DELIVERY_BASE", // your existing convention
    "NEXT_PUBLIC_CF_IMAGE_DELIVERY_BASE",
    "NEXT_PUBLIC_CLOUDFLARE_IMAGE_DELIVERY_BASE",
  ],
  "https://imagedelivery.net",
).replace(/\/+$/, "");

const WARN_VARIANTS =
  readFirst(["NEXT_PUBLIC_CF_VARIANT_WARN"], "true").toLowerCase() !== "false";

export type Variant =
  | "hero"
  | "hero2x"
  | "saleCard"
  | "category"
  | "categoryThumb"
  | "subcategoryThumb"
  | "productHero"
  | "productTile" // ✅ preferred (tile/card use)
  | "productThumb" // legacy alias -> productTile
  | "productCard" // legacy alias -> productTile
  | "public";

const OUT_VARIANT_MAP: Partial<Record<Variant, Variant>> = {
  // ✅ normalize older names to your preferred variant
  productThumb: "productTile",
  productCard: "productTile",
};

const VALID_VARIANTS: ReadonlySet<Variant> = new Set<Variant>([
  "hero",
  "hero2x",
  "saleCard",
  "category",
  "categoryThumb",
  "subcategoryThumb",
  "productHero",
  "productTile",
  "productThumb",
  "productCard",
  "public",
]);

const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (!WARN_VARIANTS) return;
  if (process.env.NODE_ENV === "production") return;
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(message);
}

function isProbablyAbsoluteUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function isCFUrl(s: string) {
  try {
    const u = new URL(s);
    return u.hostname === "imagedelivery.net";
  } catch {
    return false;
  }
}

function extractVariantFromCfUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    return segs[segs.length - 1] || null;
  } catch {
    return null;
  }
}

function assertVariant(variant: string) {
  if (!VALID_VARIANTS.has(variant as Variant)) {
    warnOnce(
      `cf-variant:${variant}`,
      `[cfImages] Variant "${variant}" is not in VALID_VARIANTS; add it in CF Images & update the union here.`,
    );
  }
}

function maybeWarnIncomingVariant(url: string) {
  const v = extractVariantFromCfUrl(url);
  if (v && !VALID_VARIANTS.has(v as Variant)) {
    warnOnce(
      `incoming-cf-variant:${v}`,
      `[cfImages] Incoming CF URL used unknown variant "${v}". We'll still swap to your requested variant.`,
    );
  }
}

function applyParams(u: URL, params?: Params) {
  if (!params) return;
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
}

function toQueryString(params?: Params): string {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * Build a Cloudflare Images delivery URL.
 * - If passed a Cloudflare delivery URL, swaps its variant.
 * - If passed another absolute URL, passes through (optionally appends params).
 * - If passed an image ID, builds the Cloudflare URL.
 */
export function cfImage(idOrUrl: string, variant: Variant = "public", params?: Params): string {
  const input = String(idOrUrl ?? "").trim();
  if (!input) return "";

  const outVariant = (OUT_VARIANT_MAP[variant] ?? variant) as Variant;
  assertVariant(outVariant);

  // Absolute URL handling
  if (isProbablyAbsoluteUrl(input)) {
    // CF delivery URL → swap variant
    if (isCFUrl(input)) {
      maybeWarnIncomingVariant(input);
      const u = new URL(input);
      u.pathname = u.pathname.replace(/\/([^/]+)$/, `/${outVariant}`);
      applyParams(u, params);
      return u.toString();
    }

    // Other absolute URL → pass-through, optionally add params
    if (!params) return input;
    const u = new URL(input);
    applyParams(u, params);
    return u.toString();
  }

  // Next/Image sometimes calls loader with "/..." paths — do not break these.
  if (input.startsWith("/")) return input;

  // CF image ID → build delivery URL
  if (!CF_HASH) {
    warnOnce(
      "cf-hash-missing",
      "[cfImages] Missing Cloudflare account hash. Set NEXT_PUBLIC_CF_ACCOUNT_HASH (or a compatible alias).",
    );
    return "";
  }

  const base = `${CF_BASE}/${CF_HASH}/${input}/${outVariant}`;
  return `${base}${toQueryString(params)}`;
}

/**
 * Pick the first non-empty URL across candidate variants.
 */
export function cfFirst(
  idOrUrl: string | null | undefined,
  variants: Variant[] = ["public"],
  params?: Params,
): string {
  const input = String(idOrUrl ?? "").trim();
  if (!input) return "";

  for (const v of variants) {
    const u = cfImage(input, v, params);
    if (u) return u;
  }
  return "";
}

/* ----------------------------- Next.js loaders ----------------------------- */

export type LoaderPreset = "default" | "categoryCard" | "subcategoryCard" | "productCard";

const TABLES: Record<LoaderPreset, Array<[number, Variant]>> = {
  default: [
    [360, "productTile"],
    [640, "saleCard"],
    [900, "category"],
    [1400, "hero"],
    [99999, "hero2x"],
  ],
  categoryCard: [
    [240, "categoryThumb"],
    [420, "categoryThumb"],
    [640, "category"],
    [99999, "category"],
  ],
  subcategoryCard: [
    [240, "subcategoryThumb"],
    [420, "subcategoryThumb"],
    [640, "category"],
    [99999, "category"],
  ],
  productCard: [
    [240, "productTile"],
    [420, "productTile"],
    [720, "saleCard"],
    [99999, "category"],
  ],
};

/**
 * Next.js Image loader that maps width → Cloudflare variant.
 * - Absolute URLs pass through.
 * - "/..." paths pass through.
 * - For CF image IDs, returns a Cloudflare delivery URL.
 */
export function makeCloudflareLoader(preset: LoaderPreset = "default") {
  const table = TABLES[preset] ?? TABLES.default;

  return function cloudflareLoader(args: { src: string; width: number; quality?: number }) {
    const src = String(args.src ?? "").trim();
    const width = Number(args.width ?? 0);

    if (!src) return "";
    if (isProbablyAbsoluteUrl(src) || src.startsWith("/")) return src;

    const row = table.find(([max]) => width > 0 && width <= max) ?? table[table.length - 1];
    const variant = row[1];

    const url = cfImage(src, variant);
    return url || src;
  };
}

export const cloudflareImagesLoader = makeCloudflareLoader("default");
