// src/components/reviews/ReviewsList.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import HelpfulButton from "./HelpfulButton";
import { apiJson, getPersistentFingerprint } from "@/lib/reviews/client-utils";

type ReviewItem = {
  id: number;
  name: string;
  rating: number;
  comment: string;
  createdAt: string;
  verified: boolean;
  helpfulCount: number;
  votedByMe: boolean;
};

type Page = { items: ReviewItem[]; cursor: string | null };

export default function ReviewsList({
  productId,
  initialPageSize = 8,
}: {
  productId: string;
  initialPageSize?: number;
}) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentryRef = useRef<HTMLDivElement | null>(null);
  const fpRef = useRef<string>("");
  const loadingRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const exhaustedRef = useRef(false);

  // Keep refs in sync so the IntersectionObserver doesn't need to be recreated.
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  useEffect(() => {
    exhaustedRef.current = exhausted;
  }, [exhausted]);

  // Reset + load first page when product changes
  useEffect(() => {
    let cancelled = false;

    fpRef.current = getPersistentFingerprint();
    setItems([]);
    setCursor(null);
    setExhausted(false);
    setError(null);

    (async () => {
      setLoading(true);
      try {
        const url =
          `/api/products/${encodeURIComponent(productId)}/reviews` +
          `?sort=newest&pageSize=${encodeURIComponent(String(initialPageSize))}` +
          `&fingerprint=${encodeURIComponent(fpRef.current)}`;

        const data = await apiJson<Page>(url);

        if (cancelled) return;

        const nextItems = Array.isArray(data?.items) ? data.items : [];
        setItems(nextItems);
        setCursor(data?.cursor ?? null);
        setExhausted(!data?.cursor || nextItems.length === 0);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load reviews");
          setItems([]);
          setCursor(null);
          setExhausted(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productId, initialPageSize]);

  // Load next page (called by IntersectionObserver)
  const loadMoreRef = useRef<() => void>(() => {});
  loadMoreRef.current = () => {
    const cur = cursorRef.current;
    if (!cur) return;
    if (loadingRef.current) return;
    if (exhaustedRef.current) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url =
          `/api/products/${encodeURIComponent(productId)}/reviews` +
          `?sort=newest&pageSize=${encodeURIComponent(String(initialPageSize))}` +
          `&cursor=${encodeURIComponent(cur)}&dir=next` +
          `&fingerprint=${encodeURIComponent(fpRef.current)}`;

        const data = await apiJson<Page>(url);
        const nextItems = Array.isArray(data?.items) ? data.items : [];

        setItems((prev) => [...prev, ...nextItems]);
        setCursor(data?.cursor ?? null);

        if (!data?.cursor || nextItems.length === 0) setExhausted(true);
      } catch (e: any) {
        // Keep existing items; just stop infinite scroll for now.
        setError(e?.message || "Failed to load more reviews");
        setExhausted(true);
      } finally {
        setLoading(false);
      }
    })();
  };

  // Single observer instance
  useEffect(() => {
    const node = sentryRef.current;
    if (!node) return;

    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        if (vis) loadMoreRef.current();
      },
      { rootMargin: "500px 0px" },
    );

    io.observe(node);
    return () => io.disconnect();
  }, []);

  const bumpHelpful = (reviewId: number, votes: number) => {
    const safeVotes = Number.isFinite(votes) ? votes : 0;
    setItems((prev) =>
      prev.map((r) =>
        r.id === reviewId ? { ...r, helpfulCount: safeVotes, votedByMe: true } : r,
      ),
    );
  };

  return (
    <div className="space-y-4">
      {items.map((r) => (
        <article key={r.id} className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium">
                {r.name}{" "}
                {r.verified ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                    Verified
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-white/60">
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}
              </div>
            </div>

            <div className="shrink-0 text-amber-400" aria-label={`${r.rating} out of 5 stars`}>
              {"★".repeat(Math.max(0, Math.min(5, r.rating)))}
              {"☆".repeat(Math.max(0, 5 - Math.max(0, Math.min(5, r.rating))))}
            </div>
          </div>

          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/90">{r.comment}</p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <HelpfulButton
              reviewId={r.id}
              initiallyVoted={r.votedByMe}
              onVoted={(v) => bumpHelpful(r.id, v)}
            />
            <span className="text-sm text-white/70">{r.helpfulCount} found this helpful</span>
          </div>
        </article>
      ))}

      <div ref={sentryRef} />

      {error ? <div className="text-sm text-red-300">{error}</div> : null}
      {loading ? <div className="text-sm text-white/60">Loading…</div> : null}
      {exhausted && items.length > 0 ? (
        <div className="text-sm text-white/60">End of reviews.</div>
      ) : null}
      {!loading && !items.length && !error ? (
        <div className="text-sm text-white/60">No reviews yet.</div>
      ) : null}
    </div>
  );
}
