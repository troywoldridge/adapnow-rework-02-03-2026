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
    return new URL(BASE).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function r2PublicUrlForKey(key: string): string {
  if (!BASE) return "";
  const k = String(key ?? "").replace(/^\/+/, "");
  return `${BASE}/${k}`;
}

export function r2PublicUrl(input: string): string {
  const value = String(input ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return r2PublicUrlForKey(value);
}
