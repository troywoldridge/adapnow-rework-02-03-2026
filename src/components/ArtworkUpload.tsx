// src/components/ArtworkUpload.tsx
"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "@/components/ImageSafe";

export type ArtworkFile = {
  type: "front" | "back" | "other";
  url: string;
  key: string;
  name: string;
  isImage: boolean;
  side: number;
};

type UploadResult = {
  ok: boolean;
  error?: string;
  uploadUrl?: string;
  publicUrl?: string; // Cloudflare R2 public (CDN) URL
  key?: string; // R2 object key / storage id
};

function xhrUploadWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      onProgress(Math.max(1, Math.min(99, pct)));
    };
    xhr.onload = () => {
      onProgress(100);
      resolve(new Response(xhr.response, { status: xhr.status, statusText: xhr.statusText }));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
}

function extBadge(name: string) {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || "").toUpperCase();
}

function isLikelyImage(file: File) {
  return (file.type || "").toLowerCase().startsWith("image/");
}

export default function ArtworkUpload({
  cartId,
  lineId,
  onUploaded,
  label = "Choose File",
  side = 1,
  accept = ".pdf,.ai,.eps,.png,.jpg,.jpeg,.tif,.tiff",
  className = "",
  continueHref = "/cart/review",
  continueLabel = "Continue to Checkout",
  showContinueEvenIfNotImage = true,
}: {
  cartId?: string;
  lineId: string;
  onUploaded?: (file: ArtworkFile | null) => void; // null = removed
  label?: string;
  side?: number; // 1=front, 2=back, etc.
  accept?: string;
  className?: string;

  /** Where the CTA should go after upload */
  continueHref?: string;
  /** CTA label text */
  continueLabel?: string;
  /** If false, only show the CTA when the uploaded file is an image */
  showContinueEvenIfNotImage?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [preview, setPreview] = useState<ArtworkFile | null>(null);
  const [over, setOver] = useState(false);

  // toggle once the server save succeeds
  const [canContinue, setCanContinue] = useState(false);

  const sideType: ArtworkFile["type"] = useMemo(() => {
    if (side === 1) return "front";
    if (side === 2) return "back";
    return "other";
  }, [side]);

  const pick = useCallback(() => inputRef.current?.click(), []);

  const resetInput = useCallback(() => {
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const persistArtworkToLine = useCallback(
    async (args: { publicUrl: string; key: string; fileName: string }) => {
      const saveRes = await fetch(`/api/cart/lines/${encodeURIComponent(lineId)}/artwork`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          side,
          url: args.publicUrl,
          key: args.key, // ✅ required for clean deletes and consistency
          fileName: args.fileName,
        }),
        cache: "no-store",
      });

      const saveJson = await saveRes.json().catch(() => ({} as any));
      if (!saveRes.ok || !saveJson?.ok) {
        throw new Error(saveJson?.error || `Failed to save artwork: ${saveRes.status}`);
      }
    },
    [lineId, side],
  );

  const handleFiles = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      setProgress(0);
      setCanContinue(false);

      try {
        // 1) Presign to R2 (Cloudflare) — we’ll get PUT URL + public CDN URL + key
        const presignRes = await fetch("/api/uploads/r2", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            cartId,
            lineId,
          }),
          cache: "no-store",
        });

        const presign: UploadResult = await presignRes.json().catch(() => ({} as any));

        if (!presignRes.ok || !presign?.ok || !presign.uploadUrl || !presign.publicUrl || !presign.key) {
          throw new Error(presign?.error || `Failed to presign (${presignRes.status})`);
        }

        // 2) PUT directly to R2 with progress (no server hop)
        const put = await xhrUploadWithProgress(presign.uploadUrl, file, (pct) => setProgress(pct));
        if (!put.ok) throw new Error(`Upload failed: ${put.status}`);

        // 3) Persist reference to cart line
        await persistArtworkToLine({
          publicUrl: presign.publicUrl,
          key: presign.key,
          fileName: file.name,
        });

        const isImage = isLikelyImage(file);

        // 4) Local preview + notify
        const fileRec: ArtworkFile = {
          type: sideType,
          url: presign.publicUrl,
          key: presign.key,
          name: file.name,
          isImage,
          side,
        };

        setPreview(fileRec);
        onUploaded?.(fileRec);

        // 5) Enable continue button
        if (isImage || showContinueEvenIfNotImage) setCanContinue(true);
        else setCanContinue(false);
      } catch (err: any) {
        setError(err?.message ?? "Upload error");
      } finally {
        setBusy(false);
        setTimeout(() => setProgress(0), 600);
        resetInput();
      }
    },
    [cartId, lineId, onUploaded, persistArtworkToLine, resetInput, showContinueEvenIfNotImage, side, sideType],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void handleFiles(f);
    },
    [handleFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void handleFiles(f);
    },
    [handleFiles],
  );

  const onRemove = useCallback(() => {
    // Best-effort server delete (do not block UI)
    fetch(`/api/cart/lines/${encodeURIComponent(lineId)}/artwork`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        side,
        key: preview?.key ?? undefined, // ✅ preferred identifier
        url: preview?.url ?? undefined, // fallback if key missing
      }),
      cache: "no-store",
    }).catch(() => {});

    setPreview(null);
    onUploaded?.(null);
    setCanContinue(false);
  }, [lineId, onUploaded, preview?.key, preview?.url, side]);

  const ContinueCta = () =>
    canContinue ? (
      <div className="mt-4 flex justify-end">
        <Link
          href={continueHref}
          prefetch={false}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white shadow hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {continueLabel}
        </Link>
      </div>
    ) : null;

  return (
    <div className={className}>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onChange} />

      {/* Preview state */}
      {preview ? (
        <div className="grid grid-cols-[120px_1fr] items-center gap-4">
          <div className="relative h-[90px] w-[120px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            {preview.isImage ? (
              <Image
                src={preview.url}
                alt={preview.name}
                fill
                unoptimized
                sizes="240px"
                className="object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-indigo-100 font-extrabold tracking-wider text-slate-800">
                {extBadge(preview.name)}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="break-words font-semibold text-slate-900">{preview.name}</div>
            <div className="flex gap-2">
              <button
                onClick={pick}
                disabled={busy}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              >
                Replace
              </button>
              <button
                onClick={onRemove}
                disabled={busy}
                className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Dropzone
        <div
          role="button"
          tabIndex={0}
          onClick={pick}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? pick() : null)}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={[
            "relative grid min-h-[160px] place-items-center rounded-xl border-2 border-dashed transition",
            over ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100",
            busy ? "pointer-events-none opacity-75" : "",
          ].join(" ")}
          aria-label={label}
        >
          <div className="p-4 text-center">
            <div className="font-bold text-slate-900">{busy ? "Uploading…" : label}</div>
            <div className="mt-1 text-sm text-slate-600">Drag &amp; drop files or click to browse</div>
            <div className="mt-0.5 text-xs text-slate-500">
              PDF, AI, EPS, PNG, JPG, TIFF • Served via Cloudflare R2/CDN
            </div>
          </div>

          {progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-xl bg-slate-200">
              <div
                className="h-full bg-blue-500 transition-[width] duration-200 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Helpful footer row */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href="/guides"
          className="text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
          prefetch={false}
        >
          Setup guides &amp; templates →
        </Link>
        <span className="text-xs text-slate-500">
          Accepted: PDF, AI, EPS, PNG, JPG, TIFF • Cloudflare R2/CDN
        </span>
      </div>

      {/* Continue CTA (appears once saved) */}
      <ContinueCta />
    </div>
  );
}
