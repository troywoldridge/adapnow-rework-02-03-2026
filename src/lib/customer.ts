// src/lib/customer.ts
import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema/customer";

type HttpStatus = 401;

function jsonError(status: HttpStatus, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function firstNonEmpty(...vals: Array<unknown>): string | null {
  for (const v of vals) {
    const t = s(v);
    if (t) return t;
  }
  return null;
}

/**
 * Ensure there's a customers row for the current Clerk user.
 * - Requires an authenticated user.
 * - Upserts by unique clerk_user_id.
 * - Populates email/name/display_name when available.
 */
export async function ensureCustomer() {
  const a = await auth();
  if (!a?.userId) throw jsonError(401, "Unauthorized");

  const user = await currentUser();

  const email =
    firstNonEmpty(
      user?.primaryEmailAddress?.emailAddress,
      user?.emailAddresses?.[0]?.emailAddress
    ) ?? null;

  const firstName = firstNonEmpty(user?.firstName) ?? null;
  const lastName = firstNonEmpty(user?.lastName) ?? null;

  const fallbackDisplay = [firstName ?? "", lastName ?? ""].map((x) => x.trim()).filter(Boolean).join(" ");
  const displayName =
    firstNonEmpty(user?.fullName, user?.username, fallbackDisplay) ?? null;

  const toInsert = {
    clerkUserId: a.userId,
    ...(email ? { email } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(displayName ? { displayName } : {}),
  };

  const [row] = await db
    .insert(customers)
    .values(toInsert)
    .onConflictDoUpdate({
      target: customers.clerkUserId,
      set: {
        ...(email ? { email } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(displayName ? { displayName } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function getCustomerByClerk(userId: string) {
  const id = s(userId);
  if (!id) return null;

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.clerkUserId, id))
    .limit(1);

  return rows[0] ?? null;
}
