// src/lib/artwork/r2Public.ts
// Public URL helpers (diagnostic only). For customer artwork, do NOT expose public URLs.
// Customer artwork should be private: store R2 keys and use signed GET URLs from server.

function readFirst(keys: string[]): string {
  for (const k of keys) {
    const v = (process.env as Record<string, string | undefined>)[k];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

const BASE = readFirst([
  "NEXT_PUBLIC_R2_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_R2_PUBLIC_BASEURL",
  "R2_PUBLIC_BASE_URL",
  "R2_PUBLIC_BASEURL",
]).replace(/\/+$/, "");

export function getR2PublicBaseUrl(): string {
  return BASE;
}

export function getR2PublicHost(): string | null {
  if (!BASE) return null;
  try {
    const u = new URL(BASE);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function r2PublicUrlForKey(key: string): string {
  if (!BASE) return "";
  const k = String(key ?? "").replace(/^\/+/, "");
  return `${BASE}/${k}`;
}
