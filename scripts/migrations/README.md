# Legacy migrations (DEPRECATED)

This folder is deprecated.

## Current authoritative workflow
Use Drizzle migrations only:

- Schema: `src/lib/db/schema/index.ts`
- Generate: `pnpm drizzle-kit generate`
- Apply: `pnpm drizzle-kit migrate`

## Archival guidance
- Do not delete legacy SQL immediately.
- Archive legacy migration folders after:
  1. Production has applied Drizzle migrations successfully
  2. A snapshot/backup exists
  3. Migration health endpoint reports clean status

Recommended archive approach:
- Move legacy folders to `archive/legacy-sql-migrations/` (outside runtime scripts)
- Keep them read-only for historical reference

