"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  InstantSearch,
  SearchBox,
  Hits,
  type HitsProps,
} from "react-instantsearch";
import type { Hit as AlgoliaHit } from "instantsearch.js";

import { getAlgoliaClient } from "@/lib/algolia";

type ProductRecord = {
  name?: string;
  slug?: string;
  imageUrl?: string;
  price?: string | number;
};

type ProductHit = AlgoliaHit<ProductRecord>;

function formatPrice(value: ProductRecord["price"]): string | null {
  if (value == null) return null;

  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num)) return null;

  // If you support multi-currency later, make this configurable.
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function HitCard({ hit }: { hit: ProductHit }) {
  const title = (hit.name && String(hit.name).trim()) || hit.objectID;
  const slug = hit.slug ? String(hit.slug).trim() : "";
  const href = slug ? `/products/${encodeURIComponent(slug)}` : null;

  const priceLabel = formatPrice(hit.price);

  const imageUrl = hit.imageUrl && String(hit.imageUrl).trim() ? String(hit.imageUrl).trim() : null;

  const CardInner = (
    <>
      {imageUrl ? (
        <div className="search-hit-image">
          <Image
            src={imageUrl}
            alt={title}
            width={72}
            height={72}
            className="search-hit-image-img"
            // If Algolia images are remote, ensure next.config.js allows the host via images.remotePatterns
          />
        </div>
      ) : (
        <div className="search-hit-image search-hit-image--empty" aria-hidden="true" />
      )}

      <div className="search-hit-body">
        <div className="search-hit-title">{title}</div>
        {priceLabel ? <div className="search-hit-price">{priceLabel}</div> : null}
      </div>
    </>
  );

  return (
    <article className="search-hit" aria-label={title}>
      {href ? (
        <Link className="search-hit-link" href={href}>
          {CardInner}
        </Link>
      ) : (
        <div className="search-hit-link" role="group" aria-label={title}>
          {CardInner}
        </div>
      )}
    </article>
  );
}

export type SearchProps = {
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

export default function Search({
  placeholder = "Search products…",
  autoFocus = false,
  className = "",
}: SearchProps) {
  const { client, indexName } = useMemo(() => getAlgoliaClient(), []);

  // Gracefully disable search if Algolia isn't configured.
  if (!client || !indexName) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[Search] Algolia client/indexName missing; search disabled.");
    }
    return null;
  }

  // Typed hit component (no `as any`)
  const hitComponent: HitsProps<ProductHit>["hitComponent"] = ({ hit }) => <HitCard hit={hit} />;

  return (
    <section className={`search ${className}`.trim()} aria-label="Site search">
      <InstantSearch searchClient={client} indexName={indexName}>
        <div className="search-box">
          <SearchBox
            placeholder={placeholder}
            autoFocus={autoFocus}
            translations={{ submitButtonTitle: "Search", resetButtonTitle: "Clear search" }}
          />
        </div>

        <div className="search-hits" aria-live="polite">
          <Hits<ProductHit> hitComponent={hitComponent} />
        </div>
      </InstantSearch>
    </section>
  );
}
