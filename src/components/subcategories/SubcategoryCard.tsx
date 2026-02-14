"use client";

import Link from "next/link";
import Image from "@/components/ImageSafe";
import { useInView } from "react-intersection-observer";
import type { SubcategoryAsset } from "@/lib/mergeUtils"; // name may be string | null

type Props = {
  subcategory: SubcategoryAsset;
};

function safeText(v: unknown): string {
  const s = String(v ?? "").trim();
  return s;
}

function buildHref(id: unknown): string {
  const s = safeText(id);
  return s ? `/subcategories/${encodeURIComponent(s)}` : "#";
}

function cfPublicUrl(cfAccountHash: string | undefined, cfId: unknown): string {
  const id = safeText(cfId);
  const hash = safeText(cfAccountHash);
  if (!hash || !id) return "";
  return `https://imagedelivery.net/${hash}/${id}/public`;
}

export default function SubcategoryCard({ subcategory }: Props) {
  const { ref, inView } = useInView({ threshold: 0.13, triggerOnce: true });

  const nameStr = safeText(subcategory?.name);
  const titleText = nameStr ? `View all products in ${nameStr}` : "View products";
  const href = buildHref((subcategory as any)?.id);

  // Prefer env account hash. If it isn't set, fall back to empty string (no image)
  // so we don't accidentally ship a hard-coded hash.
  const imgUrl = cfPublicUrl(process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH, (subcategory as any)?.cloudflare_image_id);

  return (
    <li
      ref={ref}
      className={`subcategory-card fade-in${inView ? " is-visible" : ""}`}
      tabIndex={0}
      aria-label={nameStr || undefined}
    >
      <Link href={href} className="block focus:outline-none" title={titleText}>
        <div className="subcategory-card__image-wrap">
          {imgUrl ? (
            <Image
              src={imgUrl}
              alt={nameStr || "Subcategory image"}
              fill
              className="subcategory-card__image"
              unoptimized
              sizes="(min-width: 600px) 340px, 90vw"
              priority={false}
            />
          ) : null}
        </div>

        <div className="subcategory-card__title">{nameStr || "Untitled subcategory"}</div>

        {subcategory?.description ? <div className="subcategory-card__desc">{subcategory.description}</div> : null}

        <span className="subcategory-card__btn">Browse &rarr;</span>
      </Link>
    </li>
  );
}
