"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "@/components/ImageSafe";
import { cfImage } from "@/lib/cfImages";

export type SaleCard = {
  id: string | number;
  name: string;
  href: string;
  imageUrl: string; // CF image ID or full imagedelivery URL

  discountLabel?: string; // e.g. "10% OFF", "FREE SHIPPING"
  cta?: string; // e.g. "Shop now"
  description?: string; // optional short line

  /**
   * Top-right chip: adds sparkle "Featured".
   */
  featured?: boolean;

  /**
   * Extra trust/intent badge (high-converting):
   * examples: "Most Popular", "Trending", "Best Value", "New"
   */
  badge?: string;

  /**
   * When the promo ends (ISO string or ms timestamp).
   * Example: "2026-03-01T05:00:00.000Z"
   */
  endsAt?: string | number | null;

  /**
   * Optional sort priority (higher wins).
   * Useful if marketing wants "Featured" first without reordering the list source.
   */
  priority?: number;
};

export type SalesCardsAnalyticsEvent = {
  id: string | number;
  name: string;
  href: string;
  index: number;
  featured?: boolean;
  badge?: string;
  discountLabel?: string;
  endsAt?: string | number | null;
};

export type SalesCardsProps = {
  items: SaleCard[];
  className?: string;
  heading?: string;
  subheading?: string;

  /**
   * Max cards to render to protect layout.
   * Default: 6 (two rows on desktop).
   */
  limit?: number;

  /**
   * Countdown update frequency (ms). Default: 60s.
   * Clamped to >= 15s.
   */
  countdownTickMs?: number;

  /**
   * Optional analytics adapters:
   * - onImpression fires ONCE per item per mount, when item enters the viewport
   * - onClick fires when the user clicks the card
   */
  onImpression?: (ev: SalesCardsAnalyticsEvent) => void;
  onClick?: (ev: SalesCardsAnalyticsEvent) => void;
};

function keyOf(id: string | number) {
  return String(id);
}

function parseEndsAt(v: SaleCard["endsAt"]): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function fmtRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  if (days > 0) return `Ends in ${days}d ${hours}h`;
  if (hours > 0) return `Ends in ${hours}h ${mins}m`;
  return `Ends in ${mins}m`;
}

function isExpiringSoon(msRemaining: number): boolean {
  return msRemaining > 0 && msRemaining <= 24 * 60 * 60 * 1000;
}

function clampInt(n: unknown, min: number, max: number) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function normalizeBadge(s: unknown): string | null {
  const v = String(s ?? "").trim();
  if (!v) return null;
  return v.length > 28 ? v.slice(0, 28) : v;
}

export default function SalesCards({
  items,
  className = "",
  heading = "Current Promotions",
  subheading = "Limited-time deals on our most popular products.",
  limit = 6,
  countdownTickMs = 60_000,
  onImpression,
  onClick,
}: SalesCardsProps) {
  const safeLimit = clampInt(limit, 1, 12);

  // Sorting: priority desc, then featured, then original order
  const sorted = useMemo(() => {
    const src = Array.isArray(items) ? items.filter(Boolean) : [];
    const withIndex = src.map((it, idx) => ({ it, idx }));
    withIndex.sort((a, b) => {
      const ap = Number(a.it.priority ?? 0);
      const bp = Number(b.it.priority ?? 0);
      if (bp !== ap) return bp - ap;

      const af = a.it.featured ? 1 : 0;
      const bf = b.it.featured ? 1 : 0;
      if (bf !== af) return bf - af;

      return a.idx - b.idx;
    });
    return withIndex.slice(0, safeLimit).map((x) => x.it);
  }, [items, safeLimit]);

  const [now, setNow] = useState(() => Date.now());

  const hasCountdown = useMemo(
    () => sorted.some((i) => parseEndsAt(i.endsAt) != null),
    [sorted]
  );

  useEffect(() => {
    if (!hasCountdown) return;
    const tick = Math.max(15_000, Math.floor(countdownTickMs || 60_000));
    const id = window.setInterval(() => setNow(Date.now()), tick);
    return () => window.clearInterval(id);
  }, [hasCountdown, countdownTickMs]);

  // Viewport impressions (once per card per mount)
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!onImpression) return;
    if (typeof window === "undefined") return;

    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-sales-card-id]")
    );

    if (!nodes.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          const id = el.getAttribute("data-sales-card-id") || "";
          if (!id) continue;
          if (seenRef.current.has(id)) continue;
          seenRef.current.add(id);

          const idxStr = el.getAttribute("data-sales-card-index") || "0";
          const idx = clampInt(idxStr, 0, 999);

          const name = el.getAttribute("data-sales-card-name") || "";
          const href = el.getAttribute("data-sales-card-href") || "";
          const featured = el.getAttribute("data-sales-card-featured") === "1";
          const badge = el.getAttribute("data-sales-card-badge") || undefined;
          const discountLabel = el.getAttribute("data-sales-card-discount") || undefined;

          onImpression({
            id,
            name,
            href,
            index: idx,
            featured,
            badge,
            discountLabel,
          });
        }
      },
      { root: null, threshold: 0.35 }
    );

    for (const n of nodes) io.observe(n);
    return () => io.disconnect();
  }, [onImpression, sorted]);

  if (!sorted.length) return null;

  return (
    <section
      aria-label={heading}
      className={`sales-cards ${className}`.trim()}
      data-sales-cards
    >
      <div className="sales-cards__inner">
        <div className="sales-cards__header">
          <div className="sales-cards__headings">
            <h2 className="sales-cards__title">{heading}</h2>
            {subheading ? <p className="sales-cards__sub">{subheading}</p> : null}
          </div>
        </div>

        <ul className="sales-cards__grid" role="list">
          {sorted.map((it, idx) => {
            const discountLabel = it.discountLabel ?? "10% OFF";
            const cta = it.cta ?? "Shop now";
            const img = cfImage(it.imageUrl, "saleCard");

            const endsAtMs = parseEndsAt(it.endsAt);
            const remainingMs = endsAtMs != null ? endsAtMs - now : null;
            const showCountdown = remainingMs != null && remainingMs > 0;

            const countdownText = showCountdown ? fmtRemaining(remainingMs) : null;
            const countdownSoon = showCountdown ? isExpiringSoon(remainingMs) : false;

            const badge = normalizeBadge(it.badge);

            const analyticsEvent: SalesCardsAnalyticsEvent = {
              id: it.id,
              name: it.name,
              href: it.href,
              index: idx,
              featured: it.featured,
              badge: badge ?? undefined,
              discountLabel: discountLabel || undefined,
              endsAt: it.endsAt ?? null,
            };

            return (
              <li key={keyOf(it.id)} className="sales-cards__item">
                <Link
                  href={it.href}
                  className="sales-card"
                  aria-label={`${it.name} — ${cta}`}
                  onClick={() => onClick?.(analyticsEvent)}
                  data-sales-card-id={String(it.id)}
                  data-sales-card-index={String(idx)}
                  data-sales-card-name={it.name}
                  data-sales-card-href={it.href}
                  data-sales-card-featured={it.featured ? "1" : "0"}
                  data-sales-card-badge={badge ?? ""}
                  data-sales-card-discount={discountLabel ?? ""}
                >
                  <div className="sales-card__media">
                    <div className="sales-card__chips" aria-hidden="true">
                      {badge ? (
                        <span className="sales-card__chip sales-card__chip--badge">
                          {badge}
                        </span>
                      ) : null}

                      {it.featured ? (
                        <span className="sales-card__chip sales-card__chip--featured">
                          ✨ Featured
                        </span>
                      ) : null}

                      {showCountdown ? (
                        <span
                          className={`sales-card__chip sales-card__chip--countdown${
                            countdownSoon ? " is-soon" : ""
                          }`}
                        >
                          ⏳ {countdownText}
                        </span>
                      ) : null}
                    </div>

                    {discountLabel ? (
                      <span className="sales-card__badge" aria-label={`Promotion: ${discountLabel}`}>
                        {discountLabel}
                      </span>
                    ) : null}

                    <div className="sales-card__imgWrap">
                      <Image
                        src={img}
                        alt={it.name}
                        fill
                        sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                        className="sales-card__img"
                        priority={false}
                      />
                    </div>
                  </div>

                  <div className="sales-card__body">
                    <h3 className="sales-card__name">{it.name}</h3>

                    {it.description ? <p className="sales-card__desc">{it.description}</p> : null}

                    <div className="sales-card__ctaRow">
                      <span className="sales-card__cta">{cta}</span>
                      <span className="sales-card__arrow" aria-hidden="true">
                        →
                      </span>
                    </div>

                    {showCountdown ? <span className="sr-only">{countdownText}</span> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
