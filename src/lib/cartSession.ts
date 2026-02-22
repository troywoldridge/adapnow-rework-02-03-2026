import "server-only";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";

export type CartRow = typeof carts.$inferSelect;

const CART_COOKIE = "sid";

async function getOrSetSid(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing) return String(existing);

  // Prefer crypto.randomUUID when available, otherwise fallback to a short random string.
  const sid =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  jar.set({
    name: CART_COOKIE,
    value: sid,
    path: "/",
    httpOnly: true,
  });

  return sid;
}

async function readSidFromCookie(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(CART_COOKIE)?.value;
  return raw ? String(raw) : null;
}

/** Read cart for the current session cookie (sid). */
export async function getCartForSession(): Promise<CartRow | null> {
  const sid = await readSidFromCookie();
  if (!sid) return null;

  const rows = await db
    .select()
    .from(carts)
    .where(eq(carts.sid, sid))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Ensure a cart exists for the current session (create if missing).
 * Uses a conflict-safe insert to avoid duplicates under concurrent requests.
 */
export async function getOrCreateCartForSession(): Promise<CartRow> {
  // Prefer cookie; if missing, mint + set it.
  const sid = (await readSidFromCookie()) ?? String(await getOrSetSid());

  // Fast path
  const existing = await db
    .select()
    .from(carts)
    .where(eq(carts.sid, sid))
    .limit(1);

  if (existing[0]) return existing[0];

  // Create path (race-safe if carts.sid is UNIQUE)
  await db
    .insert(carts)
    .values({ sid, status: "open" })
    // If another request inserts first, do nothing and then re-select.
    // drizzle supports onConflictDoNothing on pg; types vary by setup
    .onConflictDoNothing();

  const rows = await db
    .select()
    .from(carts)
    .where(eq(carts.sid, sid))
    .limit(1);

  // If this ever happens, it's usually missing sid cookie write or a schema issue.
  if (!rows[0]) {
    throw new Error("[cartSession] failed to create or load cart for sid");
  }

  return rows[0];
}
