"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image, { type ImageLoader } from "next/image";

type ImageRecord = {
  id: string;
  filename?: string;
  variants?: Record<string, string>;
};

type Props = {
  images: ImageRecord[] | Record<string, ImageRecord>;
};

function readPublicEnv(name: string): string {
  const v = (process.env as Record<string, string | undefined>)[name];
  return (v || "").trim();
}

function normalizeImages(input: Props["images"]): ImageRecord[] {
  const arr = Array.isArray(input) ? input : Object.values(input || {});
  const seen = new Set<string>();
  const out: ImageRecord[] = [];
  for (const x of arr) {
    const id = String(x?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...x, id });
  }
  return out;
}

export default function ClientSearch({ images }: Props) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 120);
    return () => window.clearTimeout(t);
  }, [q]);

  const imageArray = useMemo(() => normalizeImages(images), [images]);

  const filtered = useMemo(() => {
    const term = debouncedQ.trim().toLowerCase();
    if (!term) return imageArray;
    return imageArray.filter((img) => {
      const id = String(img.id || "").toLowerCase();
      const filename = String(img.filename || "").toLowerCase();
      return id.includes(term) || filename.includes(term);
    });
  }, [debouncedQ, imageArray]);

  const cfHash = readPublicEnv("NEXT_PUBLIC_CF_ACCOUNT_HASH");
  const base = readPublicEnv("NEXT_PUBLIC_IMAGE_DELIVERY_BASE");
  const variant = "public";
  const envOk = Boolean(cfHash && base);

  const cfLoader: ImageLoader = ({ src, width, quality }) => {
    const params = new URLSearchParams();
    if (quality) params.set("q", String(quality));
    if (width) params.set("w", String(width));
    const qs = params.toString();
    return `${base.replace(/\/+$/, "")}/${cfHash}/${src}/${variant}${qs ? `?${qs}` : ""}`;
  };

  const clear = () => {
    setQ("");
    inputRef.current?.focus();
  };

  return (
    <main className="container mx-auto p-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Image Admin</h1>
          <p className="mt-1 text-sm text-gray-600">
            {imageArray.length.toLocaleString()} images • {filtered.length.toLocaleString()} shown
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

      <div className="mb-6 flex items-center gap-3">
        <input
          ref={inputRef}
          className="w-full rounded-md border p-2"
          placeholder="Search filename or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search images"
        />
      </div>

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((img) => {
          const id = String(img.id);
          const name = (img.filename || id).trim();
          return (
            <li key={id} className="overflow-hidden rounded border bg-white">
              <div className="relative h-48 w-full bg-gray-100">
                {envOk ? (
                  <Image loader={cfLoader} src={id} alt={name} fill sizes="360px" className="object-cover" />
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
    </main>
  );
}
