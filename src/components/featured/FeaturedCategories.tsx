"use client";

import Link from "next/link";
import { useMemo } from "react";

import Image from "@/components/ImageSafe";
import { cfImage } from "@/lib/cfImages";

export interface FeaturedCategory {
  slug: string;
  name: string;
  imageUrl: string; // Cloudflare image ID or full imagedelivery URL
  href: string;
  description?: string;
}

export type FeaturedCategoriesProps = {
  categories: FeaturedCategory[];
  limit?: number; // default 3
  className?: string;
  heading?: string;
};

function safeText(v: unknown, fallback: string) {
  const s = String(v ?? "").trim();
  return s || fallback;
}

export default function FeaturedCategories({
  categories,
  limit = 3,
  className = "",
  heading = "Shop by Category",
}: FeaturedCategoriesProps) {
  const items = useMemo(() => {
    const list = Array.isArray(categories) ? categories : [];
    const n = Math.max(0, Math.floor(limit || 0));

    // Avoid duplicates by slug, keep order stable
    const seen = new Set<string>();
    const out: FeaturedCategory[] = [];

    for (const c of list) {
      const slug = safeText(c?.slug, "");
      if (!slug) continue;
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({
        slug,
        name: safeText(c?.name, slug),
        imageUrl: safeText(c?.imageUrl, ""),
        href: safeText(c?.href, `/category/${encodeURIComponent(slug)}`),
        description: c?.description ? safeText(c.description, "") : undefined,
      });
      if (out.length >= n) break;
    }

    return out;
  }, [categories, limit]);

  if (!items.length) return null;

  return (
    <section className={`featured-cats ${className}`.trim()} aria-label={heading}>
      <div className="featured-cats__inner">
        <ul className="featured-cats__grid">
          {items.map(({ slug, name, imageUrl, href, description }) => {
            const title = safeText(name, slug);
            const imgSrc = imageUrl ? cfImage(imageUrl, "category") : "";

            return (
              <li key={slug} className="featured-cats__card">
                <Link href={href} title={title} className="featured-cats__link">
                  <div className="featured-cats__media">
                    {imgSrc ? (
                      <Image
                        src={imgSrc}
                        alt={title}
                        fill
                        sizes="(min-width:640px) 33vw, 100vw"
                        className="featured-cats__img"
                        priority={false}
                      />
                    ) : (
                      <div className="featured-cats__placeholder" aria-hidden="true" />
                    )}
                  </div>

                  <div className="featured-cats__body">
                    <h3 className="featured-cats__title">{title}</h3>
                    {description ? (
                      <p className="featured-cats__desc">{description}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
