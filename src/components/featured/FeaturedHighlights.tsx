"use client";

import Link from "next/link";
import { useMemo } from "react";

import Image from "@/components/ImageSafe";
import { cfImage, type Variant } from "@/lib/cfImages";
import productAssetsRaw from "@/data/productAssets.json";

type ProductAsset = {
  id: number;
  name: string;
  slug?: string | null;
  cloudflare_image_id: string | null;
  description?: string | null;
};

export type FeaturedHighlightsProps = {
  maxItems?: number;
  className?: string;
  /**
   * Optional Cloudflare Images variant name.
   * Defaults to "public" (change if your project uses a different public variant).
   */
  variant?: Variant;
};

function toSlug(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeText(v: unknown, fallback: string) {
  const s = String(v ?? "").trim();
  return s || fallback;
}

export default function FeaturedHighlights({
  maxItems = 3,
  className = "",
  variant = "public",
}: FeaturedHighlightsProps) {
  const slides = useMemo(() => {
    const list = (productAssetsRaw as unknown as ProductAsset[]) || [];
    const limit = Math.max(0, Math.floor(maxItems || 0));

    // Keep first N that have an image id; avoid duplicates by id
    const seen = new Set<number>();
    const out: Array<{
      id: string;
      title: string;
      href: string;
      imageUrl: string;
      alt: string;
    }> = [];

    for (const p of list) {
      if (!p?.cloudflare_image_id) continue;
      if (typeof p.id !== "number") continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);

      const title = safeText(p.name, `Product ${p.id}`);
      const slug = toSlug(p.slug) || toSlug(p.name) || String(p.id);
      const href = `/products/${encodeURIComponent(String(p.id))}/${encodeURIComponent(slug)}`;

      // Use shared helper so you don’t hardcode account IDs / URL formats here.
      // cfImage should accept an image ID OR a full delivery URL (per your earlier patterns).
      const imageUrl = cfImage(p.cloudflare_image_id, variant);

      const alt = safeText(p.description, title);

      out.push({ id: String(p.id), title, href, imageUrl, alt });

      if (out.length >= limit) break;
    }

    return out;
  }, [maxItems, variant]);

  if (!slides.length) return null;

  return (
    <div className={`featured-highlights ${className}`.trim()} aria-label="Featured products">
      {slides.map((slide) => (
        <Link key={slide.id} href={slide.href} className="featured-highlights__card">
          <div className="featured-highlights__media">
            <Image
              src={slide.imageUrl}
              alt={slide.alt}
              fill
              className="featured-highlights__img"
              priority={false}
            />
          </div>

          <div className="featured-highlights__body">
            <p className="featured-highlights__title">{slide.title}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
