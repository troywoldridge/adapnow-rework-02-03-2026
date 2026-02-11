import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  addresses,
  type AddressRow,
  type AddressInsert,
} from "@/lib/db/schema/addresses";

type AddressInput = Omit<AddressInsert, "id" | "userId" | "createdAt" | "updatedAt">;
type AddressPatch = Partial<AddressInput> & { isDefault?: boolean };

/**
 * List addresses for a user. Default addresses come first.
 */
export async function listAddresses(userId: string): Promise<AddressRow[]> {
  return db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault));
}

/**
 * Get a user's default address (if any).
 */
export async function getDefaultAddress(userId: string): Promise<AddressRow | null> {
  const rows = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Create an address for a user.
 * If `input.isDefault` is true, atomically unset all other defaults first.
 */
export async function createAddress(userId: string, input: AddressInput): Promise<AddressRow> {
  return db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.userId, userId));
    }

    const [row] = await tx
      .insert(addresses)
      .values({ ...input, userId })
      .returning();

    return row;
  });
}

/**
 * Update an address. Only touches the current user's address.
 * If `patch.isDefault` is true, atomically unset all other defaults first.
 *
 * Returns null if not found for that user.
 */
export async function updateAddress(
  userId: string,
  id: string,
  patch: AddressPatch,
): Promise<AddressRow | null> {
  // Avoid no-op updates (and pointless updatedAt bumps).
  const keys = Object.keys(patch);
  if (keys.length === 0) return await getAddressById(userId, id);

  return db.transaction(async (tx) => {
    if (patch.isDefault === true) {
      // Unset all defaults for this user first (atomic).
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.userId, userId));
    }

    // Build update object safely
    const update: Partial<AddressInsert> = {
      ...patch,
      updatedAt: sql`now()`,
    };

    const [row] = await tx
      .update(addresses)
      .set(update)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning();

    return row ?? null;
  });
}

/**
 * Delete an address belonging to a user.
 *
 * If the deleted address was the default, we automatically promote the most recently
 * updated address (or most recently created if updatedAt isn't meaningful) to default.
 */
export async function deleteAddress(userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .limit(1);

    const existing = rows[0];
    if (!existing) return;

    await tx
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)));

    if (existing.isDefault) {
      const candidates = await tx
        .select()
        .from(addresses)
        .where(eq(addresses.userId, userId))
        .orderBy(desc(addresses.updatedAt), desc(addresses.createdAt))
        .limit(1);

      const next = candidates[0];
      if (next) {
        await tx
          .update(addresses)
          .set({ isDefault: true, updatedAt: sql`now()` })
          .where(and(eq(addresses.id, next.id), eq(addresses.userId, userId)));
      }
    }
  });
}

/**
 * Atomically set an address as default for a user.
 *
 * Note: This will still succeed even if the id doesn't exist; it just won't
 * set any row true. (That's usually fine; the caller can check existence if needed.)
 */
export async function setDefaultAddress(userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(addresses)
      .set({ isDefault: false })
      .where(eq(addresses.userId, userId));

    await tx
      .update(addresses)
      .set({ isDefault: true, updatedAt: sql`now()` })
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  });
}

/**
 * Get a single address by id for a user.
 */
export async function getAddressById(userId: string, id: string): Promise<AddressRow | null> {
  const rows = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .limit(1);

  return rows[0] ?? null;
}
