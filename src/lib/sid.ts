import "server-only";

import { cookies } from "next/headers";

const SID_COOKIE_KEYS = ["adap_sid", "sid"] as const;

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

// Next 14 (sync) + Next 15 (async)
async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

/**
 * Server-side SID reader.
 * - checks cookies: adap_sid, sid
 * - optional: also accepts x-sid header if you pass it in
 */
export async function getSidServer(opts?: { headerSid?: string | null }): Promise<string> {
  const jar = await getJar();

  for (const key of SID_COOKIE_KEYS) {
    const v = clean(jar.get?.(key)?.value);
    if (v) return v;
  }

  const hs = clean(opts?.headerSid);
  if (hs) return hs;

  return "";
}
