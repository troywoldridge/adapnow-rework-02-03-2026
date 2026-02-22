import "server-only";

import { and, desc, eq, sql, type InferModel } from "drizzle-orm";

import { db } from "@/lib/db";
import { customerAddresses } from "@/lib/db/schema/customerAddresses";

type CustomerAddressInsert = InferModel<typeof customerAddresses, "insert">;
type CustomerAddressRow = InferModel<typeof customerAddresses, "select">;
export type AddressRow = CustomerAddressRow;

import { encryptPhoneToString, normalizePhone } from "@/lib/cryptoPhone";
import { ApiError } from "@/lib/apiError";

export type DefaultKind = "shipping" | "billing";

export type AddressCreateInput = Omit<
  CustomerAddressInsert,
  | "id"
  | "customerId"
  | "phoneEnc"
  | "phoneLast4"
  | "createdAt"
  | "updatedAt"
  | "deletedAt"
> & {
  // Required: explicit customer scope (Stage 2)
  customerId: string;

  // Optional plaintext phone input (will be encrypted)
  phone?: string | null;

  // Optional defaults (split)
  isDefaultShipping?: boolean;
  isDefaultBilling?: boolean;
};

export type AddressPatch = Partial<
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

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function requireCustomerId(customerId: unknown): string {
  const id = s(customerId);
  if (!id) throw new ApiError({ status: 400, code: "BAD_REQUEST", message: "customerId is required" });
  return id;
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
 * List addresses for a customer.
 * - Excludes soft-deleted rows
 * - Orders defaults first, then most recently updated/created
 */
export async function listAddresses(customerId: string): Promise<AddressRow[]> {
  const custId = requireCustomerId(customerId);

  return db
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.customerId, custId), sql`deleted_at is null`))
    .orderBy(
      desc(customerAddresses.isDefaultShipping),
      desc(customerAddresses.isDefaultBilling),
      desc(customerAddresses.updatedAt),
      desc(customerAddresses.createdAt),
    );
}

/**
 * Get the default shipping/billing address for a customer.
 */
export async function getDefaultAddress(kind: DefaultKind, customerId: string): Promise<AddressRow | null> {
  const custId = requireCustomerId(customerId);
  const { col } = defaultCols(kind);

  const rows = await db
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.customerId, custId), eq(col, true), sql`deleted_at is null`))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Get a single address by id for a customer (excluding soft-deleted).
 */
export async function getAddressById(id: string, customerId: string): Promise<AddressRow | null> {
  const custId = requireCustomerId(customerId);
  const addrId = s(id);
  if (!addrId) return null;

  const rows = await db
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.id, addrId), eq(customerAddresses.customerId, custId), sql`deleted_at is null`))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Create an address for a customer.
 * If default flags are true, atomically unset existing defaults first.
 */
export async function createAddress(input: AddressCreateInput): Promise<AddressRow> {
  const custId = requireCustomerId(input.customerId);

  const isDefaultShipping = input.isDefaultShipping === true;
  const isDefaultBilling = input.isDefaultBilling === true;

  const country = toUpperIso2(input.country) ?? "";
  if (!country) throw new ApiError({ status: 400, code: "BAD_REQUEST", message: "country is required" });

  const sortOrder = safeSortOrder((input as any).sortOrder);
  const phoneBits = await maybeEncryptPhone(input.phone ?? null);

  const insert: CustomerAddressInsert = {
    customerId: custId,

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
    if (isDefaultShipping) {
      await tx
        .update(customerAddresses)
        .set({ isDefaultShipping: false })
        .where(and(eq(customerAddresses.customerId, custId), sql`deleted_at is null`));
    }
    if (isDefaultBilling) {
      await tx
        .update(customerAddresses)
        .set({ isDefaultBilling: false })
        .where(and(eq(customerAddresses.customerId, custId), sql`deleted_at is null`));
    }

    const [row] = await tx.insert(customerAddresses).values(insert).returning();
    return row;
  });
}

/**
 * Update an address for a customer (no cross-customer access).
 * Supports setting shipping/billing defaults and phone encryption.
 * Returns null if not found (or soft-deleted).
 */
export async function updateAddress(
  id: string,
  patch: AddressPatch & { customerId: string },
): Promise<AddressRow | null> {
  const custId = requireCustomerId(patch.customerId);

  const addrId = s(id);
  if (!addrId) throw new ApiError({ status: 400, code: "BAD_REQUEST", message: "id is required" });

  const keys = Object.keys(patch ?? {}).filter((k) => k !== "customerId");
  if (keys.length === 0) return await getAddressById(addrId, custId);

  const setDefaultShipping = patch.isDefaultShipping === true;
  const setDefaultBilling = patch.isDefaultBilling === true;

  const phoneBits = typeof patch.phone !== "undefined" ? await maybeEncryptPhone(patch.phone) : {};

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

    updatedAt: (sql`now()` as any),
  };

  return db.transaction(async (tx) => {
    if (setDefaultShipping) {
      await tx
        .update(customerAddresses)
        .set({ isDefaultShipping: false })
        .where(and(eq(customerAddresses.customerId, custId), sql`deleted_at is null`));
    }
    if (setDefaultBilling) {
      await tx
        .update(customerAddresses)
        .set({ isDefaultBilling: false })
        .where(and(eq(customerAddresses.customerId, custId), sql`deleted_at is null`));
    }

    const [row] = await tx
      .update(customerAddresses)
      .set(update)
      .where(and(eq(customerAddresses.id, addrId), eq(customerAddresses.customerId, custId), sql`deleted_at is null`))
      .returning();

    return row ?? null;
  });
}

/**
 * Soft-delete an address for a customer.
 * If it was default shipping/billing, promote a replacement (most recently updated).
 */
export async function deleteAddress(id: string, customerId: string): Promise<void> {
  const custId = requireCustomerId(customerId);
  const addrId = s(id);
  if (!addrId) return;

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(customerAddresses)
      .where(and(eq(customerAddresses.id, addrId), eq(customerAddresses.customerId, custId), sql`deleted_at is null`))
      .limit(1);

    const existing = rows[0];
    if (!existing) return;

    const wasDefaultShipping = existing.isDefaultShipping === true;
    const wasDefaultBilling = existing.isDefaultBilling === true;

    await tx
      .update(customerAddresses)
      .set({
        deletedAt: sql`now()`,
        isDefaultShipping: false,
        isDefaultBilling: false,
        updatedAt: (sql`now()` as any),
      })
      .where(and(eq(customerAddresses.id, addrId), eq(customerAddresses.customerId, custId)));

    if (wasDefaultShipping) {
      const next = await tx
        .select()
        .from(customerAddresses)
        .where(and(eq(customerAddresses.customerId, custId), sql`deleted_at is null`))
        .orderBy(desc(customerAddresses.updatedAt), desc(customerAddresses.createdAt))
        .limit(1);

      if (next[0]) {
        await tx
          .update(customerAddresses)
          .set({ isDefaultShipping: true, updatedAt: (sql`now()` as any) })
          .where(and(eq(customerAddresses.id, next[0].id), eq(customerAddresses.customerId, custId)));
      }
    }

    if (wasDefaultBilling) {
      const next = await tx
        .select()
        .from(customerAddresses)
        .where(and(eq(customerAddresses.customerId, custId), sql`deleted_at is null`))
        .orderBy(desc(customerAddresses.updatedAt), desc(customerAddresses.createdAt))
        .limit(1);

      if (next[0]) {
        await tx
          .update(customerAddresses)
          .set({ isDefaultBilling: true, updatedAt: (sql`now()` as any) })
          .where(and(eq(customerAddresses.id, next[0].id), eq(customerAddresses.customerId, custId)));
      }
    }
  });
}

/**
 * Atomically set an address as default shipping/billing for a customer.
 * Stage 2 hardening: throws NOT_FOUND if id doesn't exist for that customer.
 */
export async function setDefaultAddress(kind: DefaultKind, id: string, customerId: string): Promise<void> {
  const custId = requireCustomerId(customerId);
  const addrId = s(id);
  if (!addrId) throw new ApiError({ status: 400, code: "BAD_REQUEST", message: "id is required" });

  const { col, setTrue, setFalse } = defaultCols(kind);

  await db.transaction(async (tx) => {
    // Ensure the address exists for this customer and is not deleted
    const exists = await tx
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(and(eq(customerAddresses.id, addrId), eq(customerAddresses.customerId, custId), sql`deleted_at is null`))
      .limit(1);

    if (!exists[0]) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Address not found" });
    }

    // Unset current default for this kind
    await tx
      .update(customerAddresses)
      .set({ ...setFalse, updatedAt: (sql`now()` as any) })
      .where(and(eq(customerAddresses.customerId, custId), sql`deleted_at is null`));

    // Set chosen id as default
    await tx
      .update(customerAddresses)
      .set({ ...setTrue, updatedAt: (sql`now()` as any) })
      .where(and(eq(customerAddresses.id, addrId), eq(customerAddresses.customerId, custId), sql`deleted_at is null`));

    void col; // keep TS happy in some builds
  });
}
