// src/lib/customer.ts
import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema/customer";

export type CustomerRow = typeof customers.$inferSelect;

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function bestEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  if (!user) return null;

  const primary = clean(user.primaryEmailAddress?.emailAddress);
  if (primary) return primary;

  const first = clean(user.emailAddresses?.[0]?.emailAddress);
  return first || null;
}

function displayName(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  if (!user) return null;

  const full = clean(user.fullName);
  if (full) return full;

  const username = clean(user.username);
  if (username) return username;

  const first = clean(user.firstName);
  const last = clean(user.lastName);
  const combined = clean([first, last].filter(Boolean).join(" "));
  return combined || null;
}

/**
 * Ensure there's a customers row for the current Clerk user.
 * - Requires a non-null email per your table.
 * - Upserts by unique clerkUserId.
 */
export async function ensureCustomer(): Promise<CustomerRow> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const user = await currentUser();

  // email is required by your schema (NOT NULL)
  const email = bestEmail(user);
  if (!email) {
    throw new Error("Authenticated user has no email address");
  }

  const display = displayName(user);

  const toInsert = {
    clerkUserId: userId,
    email,
    ...(display ? { displayName: display } : {}),
    // phoneEnc / marketingOptIn can be set later via profile flows
  };

  const [cust] = await db
    .insert(customers)
    .values(toInsert)
    .onConflictDoUpdate({
      target: customers.clerkUserId,
      set: {
        email, // keep email current with Clerk
        ...(display ? { displayName: display } : {}),
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return cust;
}

export async function getCustomerByClerk(userId: string): Promise<CustomerRow | null> {
  const id = clean(userId);
  if (!id) return null;

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.clerkUserId, id))
    .limit(1);

  return rows[0] ?? null;
}
