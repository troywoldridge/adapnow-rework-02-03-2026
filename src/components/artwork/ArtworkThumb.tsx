// src/components/artwork/ArtworkThumb.tsx
"use client";

import Image from "@/components/ImageSafe";
import { artworkThumbUrl, isPdfMime, r2PublicUrl, safeText } from "@/lib/artwork/r2Public";

type Props = {
  /** R2 key or absolute URL; may also be blob:/data: before upload */
  publicUrl: string;
  mime?: string | null;
  filename?: string | null;
  className?: string;
};

function isBlobLike(u: string) {
  return /^blob:|^data:/i.test(u);
}

export default function ArtworkThumb({ publicUrl, mime, filename, className }: Props) {
  const alt = safeText(filename || "artwork");

  // If the UI is showing a client-side preview BEFORE upload, you'll get blob:/data: URLs.
  if (isBlobLike(publicUrl)) {
    return (
      <div className={className}>
        <img
          src={publicUrl}
          alt={alt}
          width={160}
          height={160}
          className="block h-[160px] w-[160px] rounded-md border border-gray-200 bg-white object-cover"
          draggable={false}
        />
      </div>
    );
  }

  // After upload — show public CDN URL
  const href = r2PublicUrl(publicUrl);

  if (isPdfMime(mime)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={alt}
        className={[
          "flex h-[160px] w-[160px] items-center justify-center rounded-md border border-gray-200 bg-white/40 text-sm font-medium hover:shadow",
          className ?? "",
        ].join(" ")}
      >
        <span>PDF</span>
      </a>
    );
  }

  const thumb = artworkThumbUrl(href);

  return (
    <a href={href} target="_blank" rel="noreferrer" title={alt} className={className}>
      <Image
        src={thumb}
        alt={alt}
        width={160}
        height={160}
        className="block h-[160px] w-[160px] rounded-md border border-gray-200 bg-white object-cover"
        draggable={false}
      />
    </a>
  );
}
