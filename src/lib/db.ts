// src/lib/db.ts
import "server-only";
import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.NEON_URL ||
  process.env.POSTGRES_URL ||
  "";

if (!connectionString) {
  throw new Error("Missing DATABASE_URL (or NEON_URL / POSTGRES_URL) env var");
}

export const db = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
});
