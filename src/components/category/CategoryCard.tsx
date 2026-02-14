"use client";

import type React from "react";
import Link from "next/link";
import Image from "@/components/ImageSafe";
import { useInView } from "react-intersection-observer";
import type { Category } from "@/types/category";

const categoryIconsByName: Record<string, React.ReactNode> = {
  "Business Cards": "💼",
  "Print Products": "🖨️",
  "Large Format": "🖼️",
  "Stationary": "📝",
  "Marketing": "📣",
  "Apparel": "👕",
};

type Props = {
  category: Category;
};

function pickCategoryIcon(category: Category): React.ReactNode {
  // Prefer exact name match (your canonical categories), then fall back to slug heuristics.
  const byName = categoryIconsByName[category.name];
  if (byName) return byName;

  const slug = String((category as any)?.slug ?? "").toLowerCase();
  if (slug.includes("business")) return "💼";
  if (slug.includes("large") || slug.includes("format")) return "🖼️";
  if (slug.includes("station")) return "📝";
  if (slug.includes("market")) return "📣";
  if (slug.includes("apparel")) return "👕";
  if (slug.includes("print")) return "🖨️";

  return "🖨️";
}

export default function CategoryCard({ category }: Props) {
  const { ref, inView } = useInView({ threshold: 0.12, triggerOnce: true });
  const icon = pickCategoryIcon(category);

  return (
    <li ref={ref} className={`category-card fade-in${inView ? " is-visible" : ""}`} tabIndex={0}>
      <Link href={`/categories/${category.id}`} className="block focus:outline-none">
        <div className="category-card__image-wrap">
          {category.image ? (
            <Image
              src={category.image}
              alt={category.name}
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
          {category.name}
        </div>
      </Link>
    </li>
  );
}
