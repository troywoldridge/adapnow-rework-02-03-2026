"use client";

import * as React from "react";
import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import Stars from "@/components/Stars";

type ReviewRow = {
  id: number;
  productId: string;
  name: string;
  rating: number;
  comment: string;
  email?: string | null;
  createdAt?: string | null;
};

type EditState = Record<
  number,
  {
    name: string;
    rating: number;
    comment: string;
  }
>;

async function fetcher(url: string): Promise<ReviewRow[]> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Request failed (${res.status})`);
  }
  return (await res.json()) as ReviewRow[];
}

function clampRating(n: number): number {
  const x = Number.isFinite(n) ? Math.trunc(n) : 0;
  if (x < 1) return 1;
  if (x > 5) return 5;
  return x;
}

function buildQuery(params: { productId?: string; rating?: string }) {
  const sp = new URLSearchParams();
  if (params.productId) sp.set("productId", params.productId);
  if (params.rating) sp.set("rating", params.rating);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export default function AdminReviewsPage() {
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<EditState>({});
  const [filterProduct, setFilterProduct] = useState("");
  const [filterRating, setFilterRating] = useState("");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const key = useMemo(() => {
    const productId = filterProduct.trim();
    const rating = filterRating.trim();
    return `/api/admin/reviews${buildQuery({ productId, rating })}`;
  }, [filterProduct, filterRating]);

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<ReviewRow[]>(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const reviews = Array.isArray(data) ? data : [];

  // Debounce text search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 140);
    return () => window.clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return reviews;
    return reviews.filter((r) => {
      const c = String(r.comment || "").toLowerCase();
      const n = String(r.name || "").toLowerCase();
      const pid = String(r.productId || "").toLowerCase();
      const em = String(r.email || "").toLowerCase();
      return c.includes(term) || n.includes(term) || pid.includes(term) || em.includes(term);
    });
  }, [reviews, debouncedSearch]);

  const allSelected = filtered.length > 0 && selected.length === filtered.length;

  function toggleSelect(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function selectAll() {
    setSelected(filtered.map((r) => r.id));
  }

  function deselectAll() {
    setSelected([]);
  }

  function toggleSelectAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) selectAll();
    else deselectAll();
  }

  function startEdit(r: ReviewRow) {
    setEditing((e) => ({
      ...e,
      [r.id]: { name: r.name ?? "", rating: clampRating(r.rating ?? 5), comment: r.comment ?? "" },
    }));
  }

  function cancelEdit(id: number) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function changeEdit(id: number, field: "name" | "rating" | "comment", value: unknown) {
    setEditing((e) => {
      const cur = e[id] || { name: "", rating: 5, comment: "" };
      if (field === "rating") {
        const n = clampRating(Number(value));
        return { ...e, [id]: { ...cur, rating: n } };
      }
      return { ...e, [id]: { ...cur, [field]: String(value ?? "") } };
    });
  }

  async function saveEdit(id: number) {
    const e = editing[id];
    if (!e) return;

    setActionLoading(true);
    setToast(null);

    try {
      const res = await fetch(`/api/admin/reviews/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          id,
          name: e.name.trim(),
          rating: clampRating(e.rating),
          comment: e.comment.trim(),
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Edit failed (${res.status})`);
      }

      cancelEdit(id);
      setToast("Saved.");
      await mutate();
    } catch (err: unknown) {
      setToast(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function bulkAction(action: "approve" | "delete", ids?: number[]) {
    const useIds = (ids && ids.length ? ids : selected).slice();
    if (!useIds.length) return;

    setActionLoading(true);
    setToast(null);

    try {
      const res = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ids: useIds, action }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Action failed (${res.status})`);
      }

      setSelected([]);
      setToast(action === "approve" ? "Approved." : "Deleted.");
      await mutate();
    } catch (err: unknown) {
      setToast(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionLoading(false);
    }
  }

  function clearFilters() {
    setFilterProduct("");
    setFilterRating("");
    setSearch("");
    setSelected([]);
    setEditing({});
    setToast(null);
    searchRef.current?.focus();
  }

  return (
    <main className="container py-10">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pending Product Reviews</h1>
          <p className="mt-1 text-sm text-gray-600">
            {isLoading ? "Loading…" : `${filtered.length.toLocaleString()} shown`}{" "}
            {reviews.length !== filtered.length ? `• ${reviews.length.toLocaleString()} total in list` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/admin/reviews/export?format=csv" className="artwork-upload-btn" download>
            Export CSV
          </a>
          <a href="/api/admin/reviews/export?format=json" className="artwork-upload-btn" download>
            Export JSON
          </a>
          <button type="button" className="artwork-upload-btn" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </div>

      {toast && (
        <div className="mb-4 rounded-md border bg-white px-3 py-2 text-sm" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <input
          ref={searchRef}
          type="text"
          placeholder="Search name, email, product, or text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border px-3 py-2 md:max-w-md"
        />

        <input
          type="text"
          placeholder="Filter by Product ID"
          value={filterProduct}
          onChange={(e) => setFilterProduct(e.target.value)}
          className="w-full rounded border px-3 py-2 md:max-w-xs"
        />

        <select
          value={filterRating}
          onChange={(e) => setFilterRating(e.target.value)}
          className="w-full rounded border px-3 py-2 md:max-w-[180px]"
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={String(r)}>
              {r} stars
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
          Select all
        </label>

        <button
          className="artwork-upload-btn"
          disabled={!selected.length || actionLoading}
          onClick={() => bulkAction("approve")}
          type="button"
        >
          Approve selected
        </button>

        <button
          className="artwork-upload-btn"
          disabled={!selected.length || actionLoading}
          onClick={() => bulkAction("delete")}
          type="button"
        >
          Delete selected
        </button>

        <span className="text-sm text-gray-600">{selected.length} selected</span>
      </div>

      {!isLoading && filtered.length === 0 ? (
        <div className="text-gray-600">No pending reviews 🎉</div>
      ) : (
        <ul className="space-y-7">
          {filtered.map((r) => {
            const isEditing = Boolean(editing[r.id]);
            const ed = editing[r.id];

            return (
              <li
                key={r.id}
                className="flex flex-col gap-4 rounded-lg border bg-white p-5 md:flex-row md:items-start"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={() => toggleSelect(r.id)}
                  className="mt-1"
                  aria-label={`Select review ${r.id}`}
                />

                <div className="min-w-[130px]">
                  <div className="flex flex-col items-center">
                    <Stars value={ed?.rating ?? r.rating} />
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={ed?.rating ?? r.rating}
                      onChange={(e) => changeEdit(r.id, "rating", e.target.value)}
                      className="mt-2 w-[70px] rounded border px-2 py-1 text-center"
                      disabled={!isEditing}
                      aria-label="Rating"
                    />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={ed?.name ?? r.name}
                    onChange={(e) => changeEdit(r.id, "name", e.target.value)}
                    disabled={!isEditing}
                    className="mb-2 w-full rounded border px-2 py-1 font-semibold md:max-w-[420px]"
                    aria-label="Reviewer name"
                  />

                  <textarea
                    value={ed?.comment ?? r.comment}
                    onChange={(e) => changeEdit(r.id, "comment", e.target.value)}
                    disabled={!isEditing}
                    className="mb-2 w-full rounded border px-2 py-1"
                    rows={3}
                    aria-label="Review comment"
                  />

                  <div className="text-xs text-gray-500">
                    Product ID: <span className="font-mono">{r.productId}</span>
                    {r.email ? (
                      <>
                        {" "}
                        &middot; Email: <span className="font-mono">{r.email}</span>
                      </>
                    ) : null}
                    {r.createdAt ? (
                      <>
                        {" "}
                        &middot; Created: <span className="font-mono">{r.createdAt}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex w-full flex-col gap-2 md:w-[150px]">
                  {isEditing ? (
                    <>
                      <button
                        className="artwork-upload-btn"
                        disabled={actionLoading}
                        onClick={() => saveEdit(r.id)}
                        type="button"
                      >
                        Save
                      </button>
                      <button
                        className="artwork-upload-btn"
                        disabled={actionLoading}
                        onClick={() => cancelEdit(r.id)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="artwork-upload-btn"
                      disabled={actionLoading}
                      onClick={() => startEdit(r)}
                      type="button"
                    >
                      Edit
                    </button>
                  )}

                  <button
                    className="artwork-upload-btn"
                    disabled={actionLoading}
                    onClick={() => bulkAction("approve", [r.id])}
                    type="button"
                  >
                    Approve
                  </button>

                  <button
                    className="artwork-upload-btn"
                    disabled={actionLoading}
                    onClick={() => bulkAction("delete", [r.id])}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
