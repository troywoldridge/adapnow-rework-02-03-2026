"use client";

import * as React from "react";

type TabKey = "product_info" | "file_prep" | "reviews";

type Props = {
  /** Tab 1: Product Info (your page passes `details`) */
  details?: React.ReactNode;

  /** Tab 2: File Prep */
  filePrep?: React.ReactNode;

  /** Tab 3: Reviews fetch target */
  reviewsProductId?: string | number | null;
  reviewsProductName?: string | null;

  /** Optional default tab */
  initialTab?: TabKey;

  className?: string;

  // Compatibility: allow older prop names without breaking build
  productInfo?: React.ReactNode;
  reviews?: React.ReactNode;

  [key: string]: any;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normalizeTabKey(v: unknown): TabKey | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!s) return null;
  if (s === "product_info" || s === "productinfo" || s === "product info") return "product_info";
  if (s === "file_prep" || s === "fileprep" || s === "file prep") return "file_prep";
  if (s === "reviews" || s === "review") return "reviews";
  return null;
}

/* ---------------- Reviews (client fetch) ---------------- */

type ReviewLike = {
  id?: string | number;
  title?: string | null;
  body?: string | null;
  rating?: number | null;
  stars?: number | null;
  createdAt?: string | null;
  created_at?: string | null;
  authorName?: string | null;
  author_name?: string | null;
};

function safeNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toStars(r: ReviewLike): number | null {
  const a = safeNum(r.rating);
  const b = safeNum(r.stars);
  const n = a ?? b;
  if (n == null) return null;
  const clamped = Math.max(0, Math.min(5, n));
  return Math.round(clamped * 10) / 10;
}

function fmtDate(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function fetchJson(url: string, signal: AbortSignal): Promise<any> {
  const res = await fetch(url, { method: "GET", headers: { "accept": "application/json" }, signal });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.error || json?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

function extractReviews(payload: any): ReviewLike[] {
  if (!payload) return [];
  // common shapes:
  // { ok:true, reviews:[...] }
  // { reviews:[...] }
  // { ok:true, data:{ reviews:[...] } }
  const arr =
    (Array.isArray(payload.reviews) && payload.reviews) ||
    (Array.isArray(payload.data?.reviews) && payload.data.reviews) ||
    (Array.isArray(payload.items) && payload.items) ||
    (Array.isArray(payload.data) && payload.data) ||
    [];
  return arr as ReviewLike[];
}

function ReviewsPanel({
  productId,
  productName,
}: {
  productId: string;
  productName?: string | null;
}) {
  const [state, setState] = React.useState<
    | { status: "idle" | "loading"; reviews: ReviewLike[] }
    | { status: "ok"; reviews: ReviewLike[] }
    | { status: "error"; reviews: ReviewLike[]; error: string }
  >({ status: "idle", reviews: [] });

  React.useEffect(() => {
    const id = String(productId || "").trim();
    if (!id) return;

    const ac = new AbortController();
    setState({ status: "loading", reviews: [] });

    (async () => {
      // Prefer product-specific endpoint if it exists in your app
      const primary = `/api/products/${encodeURIComponent(id)}/reviews`;
      const fallback = `/api/reviews?productId=${encodeURIComponent(id)}`;

      try {
        const p1 = await fetchJson(primary, ac.signal);
        const reviews = extractReviews(p1);
        setState({ status: "ok", reviews });
        return;
      } catch {
        // fall through
      }

      try {
        const p2 = await fetchJson(fallback, ac.signal);
        const reviews = extractReviews(p2);
        setState({ status: "ok", reviews });
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : "Failed to load reviews.";
        setState({ status: "error", reviews: [], error: msg });
      }
    })();

    return () => ac.abort();
  }, [productId]);

  if (state.status === "loading" || state.status === "idle") {
    return <div className="text-sm text-gray-700">Loading reviews…</div>;
  }

  if (state.status === "error") {
    return (
      <div className="space-y-2">
        <div className="text-sm text-red-700">Couldn’t load reviews.</div>
        <div className="text-xs text-gray-600">{state.error}</div>
      </div>
    );
  }

  if (!state.reviews.length) {
    return (
      <div className="space-y-2 text-sm text-gray-700">
        <p>No reviews yet{productName ? ` for ${productName}` : ""}.</p>
        <p className="text-xs text-gray-600">
          Once customers start ordering this item, their reviews will show up here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-700">
        Showing <strong>{state.reviews.length}</strong> review{state.reviews.length === 1 ? "" : "s"}.
      </div>

      <div className="space-y-3">
        {state.reviews.map((r, idx) => {
          const stars = toStars(r);
          const title = (r.title ?? "").trim();
          const body = (r.body ?? "").trim();
          const author = (r.authorName ?? r.author_name ?? "").trim();
          const date = fmtDate(r.createdAt ?? r.created_at ?? null);

          const key = r.id != null ? String(r.id) : `idx-${idx}`;

          return (
            <article key={key} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {stars != null ? (
                  <div className="text-sm font-medium text-gray-900">⭐ {stars.toFixed(1)} / 5</div>
                ) : (
                  <div className="text-sm font-medium text-gray-900">Review</div>
                )}

                {author ? <div className="text-xs text-gray-600">by {author}</div> : null}
                {date ? <div className="text-xs text-gray-600">{date}</div> : null}
              </div>

              {title ? <h4 className="mt-2 text-sm font-semibold text-gray-900">{title}</h4> : null}
              {body ? <p className="mt-2 text-sm text-gray-700">{body}</p> : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Component ---------------- */

export default function ProductInfoTabs({
  details,
  filePrep,
  reviewsProductId,
  reviewsProductName,
  initialTab,
  className,
  productInfo,
  reviews,
}: Props) {
  // Map legacy prop names if present
  const productInfoNode = details ?? productInfo;
  const filePrepNode = filePrep;

  const reviewsId = reviewsProductId == null ? "" : String(reviewsProductId).trim();
  const reviewsNode =
    reviews ??
    (reviewsId ? <ReviewsPanel productId={reviewsId} productName={reviewsProductName} /> : null);

  const tabs = React.useMemo(() => {
    const list: Array<{ key: TabKey; label: string; content: React.ReactNode }> = [];

    if (productInfoNode != null) list.push({ key: "product_info", label: "Product Info", content: productInfoNode });
    if (filePrepNode != null) list.push({ key: "file_prep", label: "File Prep", content: filePrepNode });

    // Always show Reviews tab (even if empty) — better UX, matches your layout expectation.
    list.push({
      key: "reviews",
      label: "Reviews",
      content:
        reviewsNode ??
        (
          <div className="text-sm text-gray-700">
            Reviews are not available for this product yet.
          </div>
        ),
    });

    // If everything is missing (shouldn’t happen), still render something real.
    if (!list.length) {
      list.push({
        key: "product_info",
        label: "Product Info",
        content: <div className="text-sm text-gray-700">No product details available.</div>,
      });
    }

    return list;
  }, [productInfoNode, filePrepNode, reviewsNode]);

  const first = tabs[0]!.key;

  const [active, setActive] = React.useState<TabKey>(() => {
    const wanted = normalizeTabKey(initialTab) ?? first;
    return tabs.some((t) => t.key === wanted) ? wanted : first;
  });

  React.useEffect(() => {
    if (!tabs.some((t) => t.key === active)) setActive(first);
  }, [tabs, active, first]);

  const current = tabs.find((t) => t.key === active) ?? tabs[0]!;

  return (
    <section className={cx("w-full", className)}>
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={cx(
                "rounded-md px-3 py-2 text-sm font-medium",
                isActive ? "bg-black text-white" : "border hover:bg-black/5"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="pt-4">
        <div className="max-w-none">{current.content}</div>
      </div>
    </section>
  );
}
