// src/components/subcategories/SubcategoryTileImage.tsx
// Server Component

import ImageSafe from "@/components/ImageSafe";
import { cfImage } from "@/lib/cfImages";

type Props = {
  /** Cloudflare image id OR absolute URL */
  idOrUrl: string;
  alt: string;
  /** Cloudflare variant to use when idOrUrl is an ID */
  variant?: Parameters<typeof cfImage>[1];
  className?: string;
};

function isAbsoluteHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

export default function SubcategoryTileImage({
  idOrUrl,
  alt,
  variant = "productCard",
  className = "",
}: Props) {
  const src = isAbsoluteHttpUrl(idOrUrl) ? idOrUrl : cfImage(idOrUrl, variant);

  return (
    <div className={["relative aspect-[4/3] w-full overflow-hidden rounded-lg", className].join(" ").trim()}>
      <ImageSafe
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 360px"
      />
    </div>
  );
}
