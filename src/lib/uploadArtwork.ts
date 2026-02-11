// src/lib/uploadArtwork.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

export type PresignResponse =
  | { url: string; headers?: Record<string, string>; publicUrl: string }
  | { putUrl: string; headers?: Record<string, string>; publicUrl: string };

type AttachArtworkResponse = { ok: boolean; error?: string };

function pickPutUrl(p: PresignResponse): string {
  const anyP = p as any;
  const putUrl = String(anyP?.putUrl ?? anyP?.url ?? "").trim();
  return putUrl;
}

function pickPublicUrl(p: PresignResponse): string {
  const anyP = p as any;
  return String(anyP?.publicUrl ?? "").trim();
}

function safeText(res: Response): Promise<string> {
  return res.text().catch(() => "");
}

function truncate(s: string, max = 300) {
  const t = String(s ?? "");
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Normalize a user-provided filename into something safe-ish for keys. */
function safeFilename(name: string): string {
  const n = String(name ?? "file").trim();
  // Keep letters, numbers, dot, dash, underscore. Convert spaces to dashes.
  const cleaned = n
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  return cleaned || "file";
}

export async function presignUpload(opts: {
  filename: string;
  contentType: string;
  prefix?: string; // e.g. "artwork/{sid}/{lineId}"
}): Promise<PresignResponse> {
  const res = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: safeFilename(opts.filename),
      contentType: String(opts.contentType || "application/octet-stream"),
      prefix: opts.prefix ?? undefined,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const msg = await safeText(res);
    throw new Error(`presign failed: ${res.status} ${truncate(msg)}`);
  }

  const json = (await res.json().catch(() => null)) as PresignResponse | null;
  if (!json) throw new Error("presign failed: invalid JSON response");

  const putUrl = pickPutUrl(json);
  const publicUrl = pickPublicUrl(json);
  if (!putUrl) throw new Error("presign response missing putUrl/url");
  if (!publicUrl) throw new Error("presign response missing publicUrl");

  return json;
}

export async function uploadToR2(
  putUrl: string,
  file: File,
  headers?: Record<string, string>
): Promise<void> {
  const url = String(putUrl ?? "").trim();
  if (!url) throw new Error("uploadToR2: missing putUrl");

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "content-type": file.type || "application/octet-stream",
      ...(headers ?? {}),
    },
    body: file,
  });

  if (!res.ok) {
    const msg = await safeText(res);
    throw new Error(`R2 upload failed: ${res.status} ${truncate(msg)}`);
  }
}

export async function attachArtworkToLine(
  lineId: string,
  side: number | string,
  publicUrl: string
): Promise<void> {
  const lid = String(lineId ?? "").trim();
  const url = String(publicUrl ?? "").trim();
  if (!lid) throw new Error("attachArtworkToLine: missing lineId");
  if (!url) throw new Error("attachArtworkToLine: missing publicUrl");

  const res = await fetch(`/api/cart/lines/${encodeURIComponent(lid)}/artwork`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ side: String(side), url }),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as AttachArtworkResponse;
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `attach artwork failed: ${res.status}`);
  }
}

/**
 * High-level helper: presign → PUT to R2 → attach to cart line.
 * Returns the public R2 URL you can show as the artwork thumbnail.
 */
export async function uploadArtwork(params: {
  lineId: string;
  side: number | string;
  file: File;
  sid?: string; // optional session id; server can infer if omitted
}): Promise<{ publicUrl: string }> {
  const { lineId, side, file, sid } = params;

  const lid = String(lineId ?? "").trim();
  if (!lid) throw new Error("uploadArtwork: missing lineId");
  if (!(file instanceof File)) throw new Error("uploadArtwork: missing file");

  const prefix = sid ? `artwork/${sid}/${lid}` : `artwork/${lid}`;

  const presigned = await presignUpload({
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    prefix,
  });

  const putUrl = pickPutUrl(presigned);
  const publicUrl = pickPublicUrl(presigned);

  await uploadToR2(putUrl, file, (presigned as any).headers);
  await attachArtworkToLine(lid, side, publicUrl);

  return { publicUrl };
}
