"use client";

import Image from "@/components/ImageSafe";
import { cfImage } from "@/lib/cfImages";
import { r2PublicUrl } from "@/lib/r2Public";

type Props = {
  /** R2 public (absolute URL or key) */
  url?: string | null;

  /** If present, serve via Cloudflare Images */
  cfImageId?: string | null;

  alt?: string;
  className?: string;
};

function cx(base: string, extra?: string) {
  return extra && extra.trim() ? `${base} ${extra.trim()}` : base;
}

export default function CartArtworkThumb({
  url,
  cfImageId,
  alt = "Artwork",
  className,
}: Props) {
  // Prefer Cloudflare Images if you stored an imageId
  if (cfImageId) {
    const src = cfImage(cfImageId, "productCard");
    if (src) {
      return (
        <div className={cx("cart-artwork-thumb", className)}>
          <Image
            src={src}
            alt={alt}
            fill
            sizes="56px"
            className="cart-artwork-img"
            draggable={false}
          />
        </div>
      );
    }
  }

  const href = url ? r2PublicUrl(url) : "";
  if (href) {
    return (
      <div className={cx("cart-artwork-thumb", className)}>
        <img
          src={href}
          alt={alt}
          decoding="async"
          loading="lazy"
          className="cart-artwork-img"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className={cx("cart-artwork-placeholder", className)}
      role="img"
      aria-label="No artwork uploaded"
      title="No artwork uploaded"
    >
      <svg
        className="cart-artwork-icon"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-11Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M8 14l2-2 2 2 3-3 3 3"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 9.25h.01"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">No artwork uploaded</span>
    </div>
  );
}
