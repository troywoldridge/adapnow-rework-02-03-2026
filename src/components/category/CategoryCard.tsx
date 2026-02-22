"use client";

import * as React from "react";
import Link from "next/link";
import Image from "@/components/ImageSafe";
import { useInView } from "react-intersection-observer";
import type { Category } from "@/types/category";

/**
 * NOTE:
 * Your imported `Category` type currently resolves to `unknown` (or includes `unknown`),
 * which is why TS complains when we access `category.name`, etc.
 *
 * Fix: treat incoming data as `unknown`, then narrow with a tiny runtime guard.
 */

const categoryIconsByName: Record<string, React.ReactNode> = {
  "Business Cards": "💼",
  "Print Products": "🖨️",
  "Large Format": "🖼️",
  "Stationary": "📝",
  "Marketing": "📣",
  "Apparel": "👕",
};

type CategoryLike = {
  id: string | number;
  name: string;
  image?: string | null;
  slug?: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toCategoryLike(input: unknown): CategoryLike {
  const fallback: CategoryLike = { id: "", name: "Category" };

  if (!isRecord(input)) return fallback;

  const idRaw = input.id;
  const nameRaw = input.name;

  const id =
    typeof idRaw === "string" || typeof idRaw === "number" ? idRaw : fallback.id;

  const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw : fallback.name;

  const imageRaw = input.image;
  const image =
    typeof imageRaw === "string"
      ? imageRaw
      : imageRaw == null
        ? null
        : null;

  const slugRaw = (input as Record<string, unknown>).slug;
  const slug =
    typeof slugRaw === "string"
      ? slugRaw
      : slugRaw == null
        ? null
        : null;

  return { id, name, image, slug };
}

function pickCategoryIcon(category: CategoryLike): React.ReactNode {
  // Prefer exact name match (your canonical categories), then fall back to slug heuristics.
  const byName = categoryIconsByName[category.name];
  if (byName) return byName;

  const slug = String(category.slug ?? "").toLowerCase();
  if (slug.includes("business")) return "💼";
  if (slug.includes("large") || slug.includes("format")) return "🖼️";
  if (slug.includes("station")) return "📝";
  if (slug.includes("market")) return "📣";
  if (slug.includes("apparel")) return "👕";
  if (slug.includes("print")) return "🖨️";

  return "🖨️";
}

type Props = {
  // Keep the external prop typed as Category for compatibility with callers,
  // but immediately narrow it at runtime to a safe shape.
  category: Category;
};

export default function CategoryCard({ category }: Props) {
  const c = toCategoryLike(category as unknown);
  const { ref, inView } = useInView({ threshold: 0.12, triggerOnce: true });
  const icon = pickCategoryIcon(c);

  const hrefId = encodeURIComponent(String(c.id || ""));
  const href = hrefId ? `/categories/${hrefId}` : "/categories";

  return (
    <li
      ref={ref}
      className={`category-card fade-in${inView ? " is-visible" : ""}`}
      tabIndex={0}
    >
      <Link href={href} className="block focus:outline-none">
        <div className="category-card__image-wrap">
          {c.image ? (
            <Image
              src={c.image}
              alt={c.name}
              fill
              className="category-card__image"
              unoptimized
              sizes="(min-width: 600px) 360px, 90vw"
              priority={false}
            />
          ) : null}
        </div>

        <div className="category-card__title">
          <span className="category-card__icon" aria-hidden="true">
            {icon}
          </span>
          {c.name}
        </div>
      </Link>
    </li>
  );
}
