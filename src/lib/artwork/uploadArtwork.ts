// src/lib/artwork/uploadArtwork.ts
"use client";

import type { ApiFail, PresignPutResponse } from "./index";
import { safeBasename, guessContentType } from "./index";

type PresignEndpointResponse = PresignPutResponse | ApiFail;

export async function uploadToR2ViaPresign(input: {
  file: File;
  presignUrl: string; // e.g. "/api/uploads/r2"
  extraBody?: Record<string, unknown>;
}): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const f = input.file;
  const fileName = safeBasename(f.name);
  const contentType = f.type || guessContentType(fileName);

  // 1) Ask server for presigned PUT
  const res = await fetch(input.presignUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: fileName,
      contentType,
      contentLength: Number.isFinite(f.size) ? f.size : null,
      ...(input.extraBody ?? {}),
    }),
  });

  const data = (await res.json().catch(() => null)) as PresignEndpointResponse | null;
  if (!data || (data as any).ok !== true) {
    const msg = (data as any)?.error || `Presign failed (HTTP ${res.status})`;
    return { ok: false, error: msg };
  }

  // At this point we know data is a successful PresignPutResponse
  const presign = data as PresignPutResponse;

  // 2) Upload to R2 using signed URL
  const put = await fetch(presign.url, {
    method: "PUT",
    headers: {
      ...(presign.headers ?? {}),
      // Ensure Content-Type is present
      "Content-Type": (presign.headers?.["Content-Type"] ?? contentType) as string,
    },
    body: f,
  });

  if (!put.ok) {
    const text = await put.text().catch(() => "");
    return { ok: false, error: `Upload failed (HTTP ${put.status}) ${text}`.trim() };
  }

  return { ok: true, key: presign.key };
}
