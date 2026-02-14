// src/components/product/ProductCardImage.tsx
"use client";

import Image from "@/components/ImageSafe";
import { cfImage } from "@/lib/cfImages";

type Props = {
  product: {
    name: string;
    cloudflareImageId?: string | null;
    image?: string | null;
  };
  /** Cloudflare variant when using cloudflareImageId */
  variant?: Parameters<typeof cfImage>[1];
  className?: string;
  sizes?: string;
  priority?: boolean;
};

function isAbsoluteHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function safeText(v: unknown): string {
  return String(v ?? "").trim();
}

export default function ProductCardImage({
  product,
  variant = "productCard",
  className = "object-cover",
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 360px",
  priority = false,
}: Props) {
  const name = safeText(product?.name) || "Product image";
  const id = safeText(product?.cloudflareImageId);

  const fallback = safeText(product?.image);
  const fallbackUrl = fallback && isAbsoluteHttpUrl(fallback) ? fallback : "";

  // Prefer Cloudflare Images ID (build URL directly) — avoids custom loader.
  const src = id ? cfImage(id, variant) : fallbackUrl ? fallbackUrl : "/placeholder.png";

  return (
    <Image
      src={src}
      alt={name}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      // If src is a public CDN URL, ImageSafe will bypass optimizer automatically.
      // For the local placeholder, Next can optimize normally (or bypass if you prefer).
    />
  );
}
