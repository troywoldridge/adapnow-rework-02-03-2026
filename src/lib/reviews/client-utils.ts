// src/lib/reviews/client-utils.ts
"use client";

/**
 * Client-only helpers for Reviews UI.
 * - Persistent anonymous fingerprint (localStorage)
 * - JSON fetch wrapper with better error handling
 */

function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures (private mode / blocked storage)
  }
}

function randomId(): string {
  // Prefer crypto for stronger entropy
  try {
    const c = (globalThis as any).crypto as Crypto | undefined;
    if (c?.getRandomValues) {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      let s = "";
      for (const b of bytes) s += b.toString(16).padStart(2, "0");
      return s;
    }
  } catch {
    // fallback below
  }

  // Fallback: still fine for anonymous fingerprinting
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

/**
 * Persistent anonymous fingerprint stored in localStorage.
 * Safe on SSR (returns a non-persistent fallback when window/storage is unavailable).
 */
export function getPersistentFingerprint(key = "adap_fp_v1"): string {
  const existing = safeLocalStorageGet(key);
  if (existing) return existing;

  const fp = `fp_${randomId()}`;
  safeLocalStorageSet(key, fp);
  return fp;
}

async function readErrorMessage(res: Response): Promise<string> {
  // Try JSON { error }, then fallback to text, then status code.
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const j = (await res.json()) as any;
      const msg = typeof j?.error === "string" ? j.error : "";
      if (msg) return msg;
      // Some APIs return { message }
      const msg2 = typeof j?.message === "string" ? j.message : "";
      if (msg2) return msg2;
    } catch {
      // ignore
    }
  }

  try {
    const t = (await res.text()).trim();
    if (t) return t.slice(0, 500);
  } catch {
    // ignore
  }

  return `${res.status}`;
}

/**
 * Fetch JSON with sane defaults.
 * - Adds Content-Type: application/json (does not override caller's headers)
 * - Handles empty JSON bodies (returns null as T)
 * - Better error messages from JSON/text responses
 */
export async function apiJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg);
  }

  // 204 No Content or empty body
  if (res.status === 204) return null as unknown as T;

  const text = await res.text().catch(() => "");
  if (!text) return null as unknown as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    // If server responded non-JSON but ok, return as "any" shaped string
    return text as unknown as T;
  }
}
