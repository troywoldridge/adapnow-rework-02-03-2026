"use client";

import * as React from "react";

type ExistingRecord = Record<string, string>;
type ExistingArray = Array<{ side: number; url: string }>;

export type UploadCtaProps = {
  lineId: string;
  numSides: number; // 1, 2, 4, etc.
  /** Accept both shapes to keep callers simple */
  existing?: ExistingRecord | ExistingArray | null;

  /**
   * Optional callback after a successful upload/remove.
   * If not provided, we fall back to location.reload().
   */
  onUpdated?: () => void;

  /**
   * Optional className hook
   */
  className?: string;
};

/**
 * Optional proxy:
 * If you want to serve artwork through your app (e.g., set headers, CF cache, hide origin),
 * set NEXT_PUBLIC_ARTWORK_PROXY_PREFIX to something like `/api/uploads/proxy?url=`.
 * Otherwise we'll just return the original public R2 URL.
 */
function toProxyArtworkUrl(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const prefix = process.env.NEXT_PUBLIC_ARTWORK_PROXY_PREFIX;
  if (prefix && typeof prefix === "string" && prefix.length > 0) {
    return `${prefix}${encodeURIComponent(s)}`;
  }
  return s;
}

function toRecord(existing: UploadCtaProps["existing"]): ExistingRecord {
  if (!existing) return {};
  if (Array.isArray(existing)) {
    const out: ExistingRecord = {};
    for (const row of existing) {
      if (!row) continue;
      const side = Number(row.side);
      const url = String(row.url ?? "").trim();
      if (Number.isFinite(side) && url) out[String(side)] = url;
    }
    return out;
  }
  return existing;
}

async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export default function UploadCta({
  lineId,
  numSides,
  existing = null,
  onUpdated,
  className = "",
}: UploadCtaProps) {
  const [busySide, setBusySide] = React.useState<number | null>(null);
  const [errorBySide, setErrorBySide] = React.useState<Record<number, string>>({});
  const inputsRef = React.useRef<Record<number, HTMLInputElement | null>>({});
  const mountedRef = React.useRef(true);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const existingRec = React.useMemo(() => toRecord(existing), [existing]);

  const sides = React.useMemo(
    () => Array.from({ length: Math.max(1, Math.floor(numSides || 1)) }, (_, i) => i + 1),
    [numSides]
  );

  const refresh = React.useCallback(() => {
    if (onUpdated) onUpdated();
    else location.reload();
  }, [onUpdated]);

  const pick = React.useCallback((side: number) => {
    inputsRef.current[side]?.click();
  }, []);

  const onFileChange = React.useCallback(
    async (side: number, ev: React.ChangeEvent<HTMLInputElement>) => {
      const input = ev.target;
      const file = input.files?.[0];
      if (!file) return;

      // Optional basic size guard (10MB default; adjust if your API allows larger)
      const maxBytes = 10 * 1024 * 1024;
      if (file.size > maxBytes) {
        setErrorBySide((p) => ({ ...p, [side]: "File is too large (max 10MB)." }));
        input.value = "";
        return;
      }

      setErrorBySide((p) => ({ ...p, [side]: "" }));
      setBusySide(side);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        // 1) Ask server for presigned PUT + public URL (R2)
        const presignRes = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            lineId,
            side,
          }),
          signal: ac.signal,
        });

        const presignJson = await readJsonSafe(presignRes);
        const uploadUrl = String(presignJson?.uploadUrl ?? "").trim();
        const publicUrl = String(presignJson?.publicUrl ?? "").trim();
        const presignErr = presignJson?.error ? String(presignJson.error) : "";

        if (!presignRes.ok || !uploadUrl || !publicUrl) {
          throw new Error(presignErr || `Failed to presign upload (HTTP ${presignRes.status})`);
        }

        // 2) Upload bytes THROUGH our server proxy (avoids browser→R2 CORS issues)
        const fd = new FormData();
        fd.append("file", file);
        fd.append("uploadUrl", uploadUrl);
        fd.append("contentType", file.type || "application/octet-stream");

        const proxyRes = await fetch("/api/uploads/put", {
          method: "POST",
          body: fd,
          signal: ac.signal,
        });

        if (!proxyRes.ok) {
          const t = await proxyRes.text().catch(() => "");
          throw new Error(t || `Upload failed (HTTP ${proxyRes.status})`);
        }

        // 3) Save the public R2 URL to the line/side in your backend
        const saveRes = await fetch("/api/cart/artwork", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lineId, side, url: publicUrl }),
          signal: ac.signal,
        });

        const savedJson = await readJsonSafe(saveRes);
        if (!saveRes.ok || !savedJson?.ok) {
          const msg = savedJson?.error || savedJson?.message || `Failed to save artwork (HTTP ${saveRes.status})`;
          throw new Error(String(msg));
        }

        refresh();
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        const msg = String(e?.message ?? "Upload failed");
        setErrorBySide((p) => ({ ...p, [side]: msg }));
      } finally {
        if (mountedRef.current) setBusySide(null);
        input.value = ""; // reset so user can re-select same file
      }
    },
    [lineId, refresh]
  );

  const onRemove = React.useCallback(
    async (side: number) => {
      setErrorBySide((p) => ({ ...p, [side]: "" }));
      setBusySide(side);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch("/api/cart/artwork", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lineId, side, url: "" }),
          signal: ac.signal,
        });

        const json = await readJsonSafe(res);
        if (!res.ok || !json?.ok) {
          const msg = json?.error || json?.message || `Failed to clear artwork (HTTP ${res.status})`;
          throw new Error(String(msg));
        }

        refresh();
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        const msg = String(e?.message ?? "Failed to clear artwork");
        setErrorBySide((p) => ({ ...p, [side]: msg }));
      } finally {
        if (mountedRef.current) setBusySide(null);
      }
    },
    [lineId, refresh]
  );

  return (
    <div className={`upload-cta ${className}`.trim()} aria-label="Upload artwork">
      {sides.map((side) => {
        const savedUrl = String(existingRec[String(side)] ?? "").trim();
        const displayUrl = savedUrl ? toProxyArtworkUrl(savedUrl) : "";
        const uploading = busySide === side;

        const label = savedUrl ? "Replace" : "Upload artwork";
        const err = errorBySide[side];

        return (
          <div key={side} className="upload-cta__slot">
            {/* Thumbnail or placeholder */}
            {savedUrl ? (
              // Artwork display: public R2 URL is fine for <img> (no CORS needed)
              <img
                src={displayUrl}
                alt={`Artwork side ${side}`}
                className="upload-cta__thumb"
                loading="lazy"
              />
            ) : (
              <div className="upload-cta__thumb upload-cta__thumb--empty" aria-label={`No art (Side ${side})`}>
                No art (Side {side})
              </div>
            )}

            {/* Hidden file input per side */}
            <input
              ref={(el) => {
                inputsRef.current[side] = el;
                return undefined;
              }}
              type="file"
              accept="image/*,application/pdf"
              className="upload-cta__input"
              onChange={(e) => onFileChange(side, e)}
            />

            <div className="upload-cta__actions">
              {/* Upload / Replace button */}
              <button
                type="button"
                className="btn btn-secondary btn-sm upload-cta__btn"
                onClick={() => pick(side)}
                disabled={uploading}
                aria-busy={uploading}
              >
                {uploading ? "Uploading…" : label}
              </button>

              {/* Remove button when artwork exists */}
              {savedUrl ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm upload-cta__btn upload-cta__btn--danger"
                  onClick={() => {
                    if (!confirm(`Remove artwork for side ${side}?`)) return;
                    onRemove(side);
                  }}
                  disabled={uploading}
                >
                  Remove
                </button>
              ) : null}
            </div>

            {err ? <div className="upload-cta__error" role="alert">{err}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
