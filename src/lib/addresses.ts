import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureCustomer } from "@/lib/customer";
import {
  customerAddresses,
  type CustomerAddressRow,
  type CustomerAddressInsert,
} from "@/lib/db/schema/customerAddresses";
import { encryptPhoneToString, normalizePhone } from "@/lib/cryptoPhone";

type AddressRow = CustomerAddressRow;

type AddressCreateInput = Omit<
  CustomerAddressInsert,
  | "id"
  | "customerId"
  | "phoneEnc"
  | "phoneLast4"
  | "createdAt"
  | "updatedAt"
  | "deletedAt"
> & {
  // Optional plaintext phone input (will be encrypted)
  phone?: string | null;

  // Optional defaults (split)
  isDefaultShipping?: boolean;
  isDefaultBilling?: boolean;
};

type AddressPatch = Partial<
  Omit<
    AddressCreateInput,
    | "customerId"
    | "phoneEnc"
    | "phoneLast4"
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
  >
> & {
  phone?: string | null;
};

type DefaultKind = "shipping" | "billing";

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function toUpperIso2(v: unknown): string | null {
  const x = s(v).toUpperCase();
  if (!x) return null;
  return x;
}

function safeSortOrder(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor(n));
}

function last4FromPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

async function maybeEncryptPhone(phone: string | null | undefined): Promise<{
  phoneEnc?: string;
  phoneLast4?: string | null;
}> {
  const raw = s(phone);
  if (!raw) return {};

  const normalized = normalizePhone(raw);
  if (!normalized) return {};

  const enc = await encryptPhoneToString(normalized);
  const last4 = last4FromPhone(normalized);

  return { phoneEnc: enc, phoneLast4: last4 };
}

function defaultCols(kind: DefaultKind): {
  col: typeof customerAddresses.isDefaultShipping | typeof customerAddresses.isDefaultBilling;
  setTrue: Partial<CustomerAddressInsert>;
  setFalse: Partial<CustomerAddressInsert>;
} {
  if (kind === "shipping") {
    return {
      col: customerAddresses.isDefaultShipping,
      setTrue: { isDefaultShipping: true },
      setFalse: { isDefaultShipping: false },
    };
  }
  return {
    col: customerAddresses.isDefaultBilling,
    setTrue: { isDefaultBilling: true },
    setFalse: { isDefaultBilling: false },
  };
}

/**
 * List addresses for the current authenticated customer.
 * - Excludes soft-deleted rows
 * - Orders defaults first, then most recently updated/created
 */
export async function listAddresses(): Promise<AddressRow[]> {
  const cust = await ensureCustomer();

  return db
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.customerId, cust.id), sql`deleted_at is null`))
    .orderBy(
      desc(customerAddresses.isDefaultShipping),
      desc(customerAddresses.isDefaultBilling),
      desc(customerAddresses.updatedAt),
      desc(customerAddresses.createdAt),
    );
}

/**
 * Get the default shipping/billing address for current customer.
 */
export async function getDefaultAddress(kind: DefaultKind): Promise<AddressRow | null> {
  const cust = await ensureCustomer();
  const { col } = defaultCols(kind);

  const rows = await db
    .select()
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.customerId, cust.id),
        eq(col, true),
        sql`deleted_at is null`,
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Create an address for the current customer.
 * If default flags are true, atomically unset existing defaults first.
 */
export async function createAddress(input: AddressCreateInput): Promise<AddressRow> {
  const cust = await ensureCustomer();

  const isDefaultShipping = input.isDefaultShipping === true;
  const isDefaultBilling = input.isDefaultBilling === true;

  const country = toUpperIso2(input.country) ?? "";
  if (!country) throw new Error("country is required");

  const sortOrder = safeSortOrder((input as any).sortOrder);

  const phoneBits = await maybeEncryptPhone(input.phone ?? null);

  const insert: CustomerAddressInsert = {
    customerId: cust.id,

    label: input.label ?? null,

    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    company: input.company ?? null,
    email: input.email ?? null,

    ...phoneBits,

    street1: input.street1,
    street2: input.street2 ?? null,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    country,

    isDefaultShipping,
    isDefaultBilling,

    ...(typeof sortOrder === "number" ? { sortOrder } : {}),

    metadata: input.metadata ?? (sql`'{}'::jsonb` as any),
  };

  return db.transaction(async (tx) => {
    // Maintain partial unique constraints by unsetting current defaults first.
    if (isDefaultShipping) {
      await tx
        .update(customerAddresses)
        .set({ isDefaultShipping: false })
        .where(and(eq(customerAddresses.customerId, cust.id), sql`deleted_at is null`));
    }
    if (isDefaultBilling) {
      await tx
        .update(customerAddresses)
        .set({ isDefaultBilling: false })
        .where(and(eq(customerAddresses.customerId, cust.id), sql`deleted_at is null`));
    }

    const [row] = await tx.insert(customerAddresses).values(insert).returning();
    return row;
  });
}

/**
 * Update an address for the current customer (no cross-customer access).
 * Supports setting shipping/billing defaults and phone encryption.
 * Returns null if not found (or soft-deleted).
 */
export async function updateAddress(
  id: string,
  patch: AddressPatch,
): Promise<AddressRow | null> {
  const cust = await ensureCustomer();

  const addrId = s(id);
  if (!addrId) throw new Error("id is required");

  const keys = Object.keys(patch ?? {});
  if (keys.length === 0) return await getAddressById(addrId);

  const setDefaultShipping = patch.isDefaultShipping === true;
  const setDefaultBilling = patch.isDefaultBilling === true;

  const phoneBits =
    typeof patch.phone !== "undefined" ? await maybeEncryptPhone(patch.phone) : {};

  const update: Partial<CustomerAddressInsert> = {
    ...(typeof patch.label !== "undefined" ? { label: patch.label ?? null } : {}),
    ...(typeof patch.firstName !== "undefined" ? { firstName: patch.firstName ?? null } : {}),
    ...(typeof patch.lastName !== "undefined" ? { lastName: patch.lastName ?? null } : {}),
    ...(typeof patch.company !== "undefined" ? { company: patch.company ?? null } : {}),
    ...(typeof patch.email !== "undefined" ? { email: patch.email ?? null } : {}),

    ...(typeof patch.street1 !== "undefined" ? { street1: patch.street1 } : {}),
    ...(typeof patch.street2 !== "undefined" ? { street2: patch.street2 ?? null } : {}),
    ...(typeof patch.city !== "undefined" ? { city: patch.city } : {}),
    ...(typeof patch.state !== "undefined" ? { state: patch.state } : {}),
    ...(typeof patch.postalCode !== "undefined" ? { postalCode: patch.postalCode } : {}),
    ...(typeof patch.country !== "undefined"
      ? { country: (toUpperIso2(patch.country) ?? patch.country) as any }
      : {}),

    ...phoneBits,

    ...(typeof patch.isDefaultShipping !== "undefined"
      ? { isDefaultShipping: patch.isDefaultShipping === true }
      : {}),
    ...(typeof patch.isDefaultBilling !== "undefined"
      ? { isDefaultBilling: patch.isDefaultBilling === true }
      : {}),

    ...(typeof (patch as any).sortOrder !== "undefined"
      ? { sortOrder: safeSortOrder((patch as any).sortOrder) ?? 0 }
      : {}),

    ...(typeof patch.metadata !== "undefined" ? { metadata: patch.metadata as any } : {}),

    updatedAt: sql`now()`,
  };

  return db.transaction(async (tx) => {
    // If setting as default, unset existing defaults first (atomic).
    if (setDefaultShipping) {
      await tx
        .update(customerAddresses)
        .set({ isDefaultShipping: false })
        .where(and(eq(customerAddresses.customerId, cust.id), sql`deleted_at is null`));
    }
    if (setDefaultBilling) {
      await tx
        .update(customerAddresses)
        .set({ isDefaultBilling: false })
        .where(and(eq(customerAddresses.customerId, cust.id), sql`deleted_at is null`));
    }

    const [row] = await tx
      .update(customerAddresses)
      .set(update)
      .where(
        and(
          eq(customerAddresses.id, addrId),
          eq(customerAddresses.customerId, cust.id),
          sql`deleted_at is null`,
        ),
      )
      .returning();

    return row ?? null;
  });
}

/**
 * Soft-delete an address for the current customer.
 * If it was default shipping/billing, promote a replacement (most recently updated).
 */
export async function deleteAddress(id: string): Promise<void> {
  const cust = await ensureCustomer();
  const addrId = s(id);
  if (!addrId) return;

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, addrId),
          eq(customerAddresses.customerId, cust.id),
          sql`deleted_at is null`,
        ),
      )
      .limit(1);

    const existing = rows[0];
    if (!existing) return;

    const wasDefaultShipping = existing.isDefaultShipping === true;
    const wasDefaultBilling = existing.isDefaultBilling === true;

    // Soft delete it and unset defaults (so partial unique doesn't block promotions)
    await tx
      .update(customerAddresses)
      .set({
        deletedAt: sql`now()`,
        isDefaultShipping: false,
        isDefaultBilling: false,
        updatedAt: sql`now()`,
      })
      .where(and(eq(customerAddresses.id, addrId), eq(customerAddresses.customerId, cust.id)));

    // Promote a new default if needed
    if (wasDefaultShipping) {
      const next = await tx
        .select()
        .from(customerAddresses)
        .where(and(eq(customerAddresses.customerId, cust.id), sql`deleted_at is null`))
        .orderBy(desc(customerAddresses.updatedAt), desc(customerAddresses.createdAt))
        .limit(1);

      if (next[0]) {
        await tx
          .update(customerAddresses)
          .set({ isDefaultShipping: true, updatedAt: sql`now()` })
          .where(and(eq(customerAddresses.id, next[0].id), eq(customerAddresses.customerId, cust.id)));
      }
    }

    if (wasDefaultBilling) {
      const next = await tx
        .select()
        .from(customerAddresses)
        .where(and(eq(customerAddresses.customerId, cust.id), sql`deleted_at is null`))
        .orderBy(desc(customerAddresses.updatedAt), desc(customerAddresses.createdAt))
        .limit(1);

      if (next[0]) {
        await tx
          .update(customerAddresses)
          .set({ isDefaultBilling: true, updatedAt: sql`now()` })
          .where(and(eq(customerAddresses.id, next[0].id), eq(customerAddresses.customerId, cust.id)));
      }
    }
  });
}

/**
 * Atomically set an address as default shipping/billing for the current customer.
 */
export async function setDefaultAddress(kind: DefaultKind, id: string): Promise<void> {
  const cust = await ensureCustomer();
  const addrId = s(id);
  if (!addrId) return;

  const { col, setTrue, setFalse } = defaultCols(kind);

  await db.transaction(async (tx) => {
    // Unset current default for this kind
    await tx
      .update(customerAddresses)
      .set({ ...setFalse, updatedAt: sql`now()` })
      .where(and(eq(customerAddresses.customerId, cust.id), sql`deleted_at is null`));

    // Set chosen id as default (only if it belongs to this customer and isn't deleted)
    await tx
      .update(customerAddresses)
      .set({ ...setTrue, updatedAt: sql`now()` })
      .where(
        and(
          eq(customerAddresses.id, addrId),
          eq(customerAddresses.customerId, cust.id),
          sql`deleted_at is null`,
        ),
      );

    // NOTE: if addrId doesn't exist for this customer, nothing becomes default.
    // Caller can verify via getDefaultAddress() if desired.
    void col; // keep TS happy for unused col in some builds
  });
}

/**
 * Get a single address by id for the current customer (excluding soft-deleted).
 */
export async function getAddressById(id: string): Promise<AddressRow | null> {
  const cust = await ensureCustomer();
  const addrId = s(id);
  if (!addrId) return null;

  const rows = await db
    .select()
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.id, addrId),
        eq(customerAddresses.customerId, cust.id),
        sql`deleted_at is null`,
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
