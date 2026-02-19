// src/lib/artwork/index.ts
// Client-safe barrel. DO NOT import server-only modules from here.
//
// Server code must import from:
//   - "@/lib/artwork/server"
//   - "@/lib/artwork/artworkNeeded" (server module)
//
// Client code may import from:
//   - "@/lib/artwork/uploadArtwork"
//   - "@/lib/artwork/artworkThumb"
//   - "@/lib/artwork/r2Public" (diagnostic only)

export type UploadKind = "artwork" | "attachment";

export type PresignPutResponse = {
  ok: true;
  key: string;
  url: string;
  headers: Record<string, string>;
  expiresIn: number;
};

export type PresignGetResponse = {
  ok: true;
  key: string;
  url: string;
  expiresIn: number;
};

export type ApiFail = { ok: false; error: string };

export function safeBasename(name: string): string {
  const s = String(name ?? "").trim();
  const base = s.split(/[\\/]/).pop() ?? "file";
  // keep basic safe chars
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "file";
}

export function guessContentType(filename: string): string {
  const f = safeBasename(filename).toLowerCase();
  if (f.endsWith(".pdf")) return "application/pdf";
  if (f.endsWith(".png")) return "image/png";
  if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image/jpeg";
  if (f.endsWith(".webp")) return "image/webp";
  if (f.endsWith(".tif") || f.endsWith(".tiff")) return "image/tiff";
  if (f.endsWith(".ai")) return "application/postscript";
  if (f.endsWith(".eps")) return "application/postscript";
  return "application/octet-stream";
}

export function isAllowedArtworkType(contentType: string): boolean {
  const ct = String(contentType || "").toLowerCase();
  return (
    ct === "application/pdf" ||
    ct === "image/png" ||
    ct === "image/jpeg" ||
    ct === "image/webp" ||
    ct === "image/tiff" ||
    ct === "application/postscript" ||
    ct === "application/octet-stream" // allow when browser can't detect; validate server-side too
  );
}
