// src/components/SubcategoryTileImage.tsx
import * as React from "react";
import Image from "next/image";

type Props = {
  src?: string | null;
  alt?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
  /**
   * Optional fallback image (local/static or remote).
   * If src is missing, we use fallbackSrc.
   */
  fallbackSrc?: string;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export default function SubcategoryTileImage({
  src,
  alt = "",
  width = 800,
  height = 600,
  priority = false,
  className,
  fallbackSrc = "/placeholder.png",
}: Props) {
  const resolved = safeString(src).trim() || fallbackSrc;

  // Next/Image will throw if remote domains aren't configured.
  // If you have ImageSafe component, you can swap this later.
  return (
    <div className={className}>
      <Image
        src={resolved}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className="h-auto w-full rounded-md object-cover"
      />
    </div>
  );
}
