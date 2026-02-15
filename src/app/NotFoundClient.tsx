// src/app/NotFoundClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function clampPath(p: string | null | undefined): string {
  // Only allow safe internal paths. Fall back to "/".
  const s = (p || "").trim();
  if (!s) return "/";

  // Must be a relative internal path.
  if (!s.startsWith("/")) return "/";

  // Disallow protocol-looking strings or double slashes.
  if (s.startsWith("//")) return "/";

  // Basic normalization: collapse whitespace
  return s.replace(/\s+/g, "");
}

function formatTitleFromPath(pathname: string): string {
  const s = (pathname || "/").trim();
  if (s === "/" || s === "") return "Home";

  // Drop query/hash if present (defensive)
  const base = s.split("?")[0].split("#")[0];

  // Turn /a/b-c_d into "A / B C D"
  const parts = base
    .split("/")
    .filter(Boolean)
    .slice(0, 3)
    .map((p) =>
      p
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    );

  return parts.length ? parts.join(" / ") : "That Page";
}

function safeDisplayPath(pathname: string): string {
  const s = (pathname || "/").trim();
  const base = s.split("?")[0].split("#")[0];
  // Keep it short so it doesn’t blow up the layout.
  if (base.length <= 80) return base || "/";
  return base.slice(0, 77) + "…";
}

export default function NotFoundClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname() || "/";

  const from = clampPath(sp.get("from")) || "/";
  const attemptedLabel = formatTitleFromPath(pathname);
  const attemptedPath = safeDisplayPath(pathname);

  const [q, setQ] = React.useState("");

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;

    // If you don't have /search yet, change this to a real route you do have.
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <section className="rounded-2xl border bg-white p-8 shadow-sm ring-1 ring-black/5">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          {/* “Misprint” badge */}
          <div className="inline-flex items-center gap-2 rounded-full border bg-slate-50 px-4 py-2 text-sm text-slate-700">
            <span aria-hidden>🖨️</span>
            <span className="font-medium">404 — Misprint Detected</span>
          </div>

          <h1 className="mt-5 text-3xl font-extrabold tracking-tight">
            We can’t find that page.
          </h1>

          <p className="mt-3 text-slate-600">
            Looks like this URL didn’t make it off the press. The page{" "}
            <span className="font-semibold text-slate-800">{attemptedLabel}</span>{" "}
            isn’t available (or it moved).
          </p>

          <div className="mt-3 rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Requested:</span>{" "}
            <code className="break-all">{attemptedPath}</code>
          </div>

          {/* CTA Row */}
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Go to Home
            </Link>

            <Link
              href={from}
              className="rounded-xl border px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Go Back
            </Link>

            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-xl border px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Try Again
            </button>
          </div>

          {/* Quick links */}
          <div className="mt-8 w-full rounded-xl border bg-slate-50 p-5 text-left">
            <p className="text-sm font-semibold text-slate-900">Popular destinations</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Link
                href="/products"
                className="rounded-lg bg-white px-4 py-3 text-sm hover:bg-slate-100"
              >
                🛒 Shop Products
                <span className="block text-xs text-slate-500">
                  Browse categories and best sellers
                </span>
              </Link>

              <Link
                href="/guides"
                className="rounded-lg bg-white px-4 py-3 text-sm hover:bg-slate-100"
              >
                📄 Artwork Guides
                <span className="block text-xs text-slate-500">
                  Templates + print-ready setup PDFs
                </span>
              </Link>

              <Link
                href="/contact"
                className="rounded-lg bg-white px-4 py-3 text-sm hover:bg-slate-100"
              >
                💬 Contact Support
                <span className="block text-xs text-slate-500">
                  We’ll help you find what you need
                </span>
              </Link>

              <Link
                href="/cart"
                className="rounded-lg bg-white px-4 py-3 text-sm hover:bg-slate-100"
              >
                🧾 View Cart
                <span className="block text-xs text-slate-500">
                  Pick up where you left off
                </span>
              </Link>
            </div>
          </div>

          {/* Search */}
          <form onSubmit={onSearch} className="mt-7 w-full max-w-xl">
            <label htmlFor="site-search" className="sr-only">
              Search
            </label>

            <div className="flex items-stretch gap-2">
              <input
                id="site-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products, guides, or services…"
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
              />
              <button
                type="submit"
                className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-600"
              >
                Search
              </button>
            </div>

            <p className="mt-2 text-center text-xs text-slate-500">
              Tip: Try “business cards”, “banners”, “stickers”, or “templates”.
            </p>
          </form>

          <p className="mt-8 text-xs text-slate-400">
            Error code: 404 • If you believe this is a mistake,{" "}
            <Link href="/contact" className="underline hover:no-underline">
              tell us here
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
