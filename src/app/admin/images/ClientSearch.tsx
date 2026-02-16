"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Image, { type ImageLoader } from "next/image";
import Fuse from "fuse.js";

type ImageRecord = {
  id: string;
  filename?: string;
  variants?: Record<string, string>;
};

type Props = {
  images: ImageRecord[] | Record<string, ImageRecord>;
};

function readPublicEnv(name: string): string {
  // In the browser, missing NEXT_PUBLIC_* vars become `undefined`.
  const v = (process.env as Record<string, string | undefined>)[name];
  return (v || "").trim();
}

function normalizeImages(input: Props["images"]): ImageRecord[] {
  const arr = Array.isArray(input) ? input : Object.values(input || {});
  // Deduplicate by id and keep the first occurrence
  const seen = new Set<string>();
  const out: ImageRecord[] = [];
  for (const x of arr) {
    if (!x) continue;
    const id = String((x as any).id || "").trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...x, id });
  }
  return out;
}

export default function ClientSearch({ images }: Props) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus search on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Normalize to an array (stable + deduped)
  const imageArray = useMemo(() => normalizeImages(images), [images]);

  // Configure Fuse (memoized)
  const fuse = useMemo(() => {
    return new Fuse(imageArray, {
      keys: [
        { name: "filename", weight: 0.7 },
        { name: "id", weight: 0.3 },
      ],
      threshold: 0.35,
      minMatchCharLength: 2,
      ignoreLocation: true,
      includeScore: false,
    });
  }, [imageArray]);

  // Debounce query to avoid re-running Fuse on every keystroke for large sets
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 120);
    return () => window.clearTimeout(t);
  }, [q]);

  const filtered = useMemo(() => {
    const term = debouncedQ.trim();
    if (!term) return imageArray;
    return fuse.search(term).map((r) => r.item);
  }, [debouncedQ, fuse, imageArray]);

  // Cloudflare Images settings (client-safe env vars)
  const cfHash = readPublicEnv("NEXT_PUBLIC_CF_ACCOUNT_HASH");
  const base = readPublicEnv("NEXT_PUBLIC_IMAGE_DELIVERY_BASE"); // e.g. "https://imagedelivery.net"
  const variant = "public";

  const envOk = Boolean(cfHash && base);

  // Minimal Cloudflare loader for next/image
  const cfLoader: ImageLoader = ({ src, width, quality }) => {
    // `src` is the image id (we pass id as src below)
    // Cloudflare accepts query params like width/quality (w, q).
    const params = new URLSearchParams();
    if (quality) params.set("q", String(quality));
    if (width) params.set("w", String(width));
    const qs = params.toString();
    return `${base.replace(/\/+$/, "")}/${cfHash}/${src}/${variant}${qs ? `?${qs}` : ""}`;
  };

  function clear() {
    setQ("");
    inputRef.current?.focus();
  }

  return (
    <main className="container mx-auto p-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Image Admin</h1>
          <p className="mt-1 text-sm text-gray-600">
            {imageArray.length.toLocaleString()} images •{" "}
            {filtered.length.toLocaleString()} shown
          </p>
        </div>

        <button
          type="button"
          onClick={clear}
          className="rounded-md border bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50"
          disabled={!q}
        >
          Clear
        </button>
      </div>

      {!envOk && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Missing Cloudflare Images env vars. Set{" "}
          <span className="font-mono">NEXT_PUBLIC_IMAGE_DELIVERY_BASE</span> and{" "}
          <span className="font-mono">NEXT_PUBLIC_CF_ACCOUNT_HASH</span>.
        </div>
      )}

      <div className="mb-6 flex items-center gap-3">
        <input
          ref={inputRef}
          className="w-full rounded-md border p-2"
          placeholder="Search filename or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search images"
        />

        <kbd className="hidden select-none rounded border bg-white px-2 py-1 text-xs text-gray-600 sm:inline-block">
          esc
        </kbd>
      </div>

      {/* ESC to clear */}
      <KeyListener
        enabled={Boolean(q)}
        onEscape={() => {
          clear();
        }}
      />

      {filtered.length === 0 ? (
        <p>
          No images match “<span className="font-medium">{debouncedQ}</span>”.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((img) => {
            const id = String(img.id);
            const name = (img.filename || id).trim();

            return (
              <li key={id} className="overflow-hidden rounded border bg-white">
                <div className="relative h-48 w-full bg-gray-100">
                  {envOk ? (
                    <Image
                      loader={cfLoader}
                      src={id}
                      alt={name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 360px"
                      className="object-cover"
                      // No need for `unoptimized` because we provide a custom loader.
                      // Provide a safe fallback if CF blocks specific ids.
                      onError={() => {
                        // next/image doesn't give us a great recovery path; we keep layout stable.
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
                      Missing env vars
                    </div>
                  )}
                </div>

                <div className="p-2">
                  <p className="break-all text-sm font-medium">{name}</p>
                  <p className="break-all text-xs text-gray-500">{id}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function KeyListener({
  enabled,
  onEscape,
}: {
  enabled: boolean;
  onEscape: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onEscape]);

  return null;
}
