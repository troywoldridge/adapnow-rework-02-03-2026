"use client";

import Link from "next/link";
import Image from "@/components/ImageSafe";
import { useInView } from "react-intersection-observer";
import type { Product } from "@/types/product";

type Props = {
  product: Product;
};

function safeText(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
}

function safeAlt(v: unknown): string {
  const s = safeText(v, "").trim();
  return s || "";
}

export default function ProductCard({ product }: Props) {
  const { ref, inView } = useInView({ threshold: 0.12, triggerOnce: true });

  const name = safeText(product?.name, "Product");
  const ariaLabel = name; // must be string | undefined (NOT null)
  const imgSrc = safeText((product as any)?.image, "").trim();
  const desc = safeText(product?.description, "").trim();

  return (
    <li
      ref={ref}
      className={`product-card fade-in${inView ? " is-visible" : ""}`}
      tabIndex={0}
      aria-label={ariaLabel}
    >
      <Link
        href={`/products/${encodeURIComponent(String((product as any)?.id ?? ""))}`}
        className="block focus:outline-none"
        title={`View ${name}`}
      >
        <div className="product-card__image-wrap">
          {imgSrc ? (
            <Image
              src={imgSrc}
              alt={safeAlt(name)}
              fill
              className="product-card__image"
              unoptimized
              sizes="(min-width: 600px) 340px, 90vw"
              priority={false}
            />
          ) : null}
        </div>

        <div className="product-card__body">
          <div className="product-card__title">{name}</div>
          {desc ? <div className="product-card__desc">{desc}</div> : null}

          {/*
            Example badges:
            const badge = product.isNew ? "New" : product.isBestseller ? "Bestseller" : undefined;
            {badge && <span className="product-card__badge">{badge}</span>}
          */}
        </div>
      </Link>
    </li>
  );
}
