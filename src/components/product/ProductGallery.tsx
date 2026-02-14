// src/components/product/ProductGallery.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "@/components/ImageSafe";

export type ProductGalleryProps = {
  /** Fully-qualified image URLs (Cloudflare imagedelivery.net URLs are perfect) */
  images: string[];
  productName: string;
  className?: string;
  /** Optional: start on a specific image */
  initialIndex?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function safeText(v: unknown) {
  return String(v ?? "").trim();
}

export default function ProductGallery({
  images,
  productName,
  className = "",
  initialIndex = 0,
}: ProductGalleryProps) {
  const safeImages = useMemo(() => {
    const arr = Array.isArray(images) ? images : [];
    // de-dupe while preserving order
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of arr) {
      const s = safeText(raw);
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }, [images]);

  const maxIdx = Math.max(0, safeImages.length - 1);
  const [index, setIndex] = useState(() => clamp(initialIndex, 0, maxIdx));

  // If images change, keep index in range
  useEffect(() => {
    setIndex((i) => clamp(i, 0, maxIdx));
  }, [maxIdx]);

  const name = useMemo(() => safeText(productName) || "Product image", [productName]);

  const current = safeImages[clamp(index, 0, maxIdx)] || "";

  const go = useCallback((next: number) => {
    setIndex(clamp(next, 0, maxIdx));
  }, [maxIdx]);

  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Keyboard support: left/right arrows
  useEffect(() => {
    if (safeImages.length <= 1) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, prev, safeImages.length]);

  if (safeImages.length === 0) {
    return (
      <div className={`rounded-2xl border bg-white p-4 ${className}`}>
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
          No images
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Hero */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-white">
        <Image
          src={current}
          alt={name}
          fill
          sizes="(max-width: 1024px) 100vw, 720px"
          className="object-cover"
          priority
          draggable={false}
        />

        {safeImages.length > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-white/75 px-3 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-white/75 px-3 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            >
              ›
            </button>

            <div className="absolute bottom-2 right-2 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white">
              {index + 1} / {safeImages.length}
            </div>
          </>
        ) : null}
      </div>

      {/* Thumbnails */}
      {safeImages.length > 1 ? (
        <div className="grid grid-cols-5 gap-2 md:grid-cols-6" role="list">
          {safeImages.map((src, i) => {
            const active = i === index;
            return (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => go(i)}
                className={[
                  "group relative aspect-square overflow-hidden rounded-lg border transition",
                  active ? "border-blue-600 ring-2 ring-blue-600" : "border-neutral-200 hover:border-neutral-300",
                ].join(" ")}
                aria-label={`Show image ${i + 1}`}
                aria-current={active ? "true" : undefined}
              >
                <Image
                  src={src}
                  alt={`${name} - ${i + 1}`}
                  fill
                  sizes="120px"
                  className="object-cover"
                  draggable={false}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
