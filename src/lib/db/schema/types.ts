// src/lib/db/schema/types.ts
// Shared schema helpers (Drizzle).
// Keep database-related custom types here (e.g., bytea for encrypted fields).

import { customType } from "drizzle-orm/pg-core";

/**
 * bytea <-> Buffer mapping for Postgres.
 * Use for encrypted blobs (phoneEnc, tokens, etc).
 */
export const bytea = customType<{
  data: Buffer | null;
  driverData: Buffer | null;
}>({
  dataType() {
    return "bytea";
  },
});
