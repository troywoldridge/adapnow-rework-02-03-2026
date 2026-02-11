// src/lib/pii.ts
import "server-only";

import { sql, type SQL } from "drizzle-orm";

/**
 * PII encryption/decryption helpers using Postgres pgcrypto:
 * - pgp_sym_encrypt(text, key)
 * - pgp_sym_decrypt(bytea, key)
 *
 * Requirements:
 *   CREATE EXTENSION IF NOT EXISTS pgcrypto;
 *
 * NOTE:
 * - This runs on the DB server, so the key is sent as a parameterized value.
 * - Keep PII_KEY server-only (do NOT use NEXT_PUBLIC_).
 */
const PII_KEY = process.env.PII_KEY;
if (!PII_KEY) {
  throw new Error("Missing PII_KEY");
}

/**
 * Encrypt a plaintext value into a SQL expression.
 * Use this in insert/update values.
 */
export function enc(plain: string | null | undefined): SQL | null {
  if (!plain) return null;
  const v = String(plain);
  return sql`pgp_sym_encrypt(${v}, ${PII_KEY})`;
}

/**
 * Decrypt an encrypted bytea column into text.
 * Use in select projections.
 *
 * Example:
 *   db.select({ email: dec(customers.emailEnc).as("email") }).from(customers)
 */
export function dec(col: SQL | unknown): SQL<string> {
  return sql<string>`pgp_sym_decrypt(${col as any}, ${PII_KEY})`;
}

/**
 * Decrypt but allow NULL (avoids decrypting nulls).
 * Useful if column can be null.
 */
export function decNullable(col: SQL | unknown): SQL<string | null> {
  return sql<string | null>`CASE WHEN ${col as any} IS NULL THEN NULL ELSE pgp_sym_decrypt(${col as any}, ${PII_KEY}) END`;
}
