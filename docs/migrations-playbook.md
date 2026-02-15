# Migrations Playbook (Authoritative)

This project uses **Drizzle** migrations as the **only** supported schema migration system.

## Goals
- One authoritative schema definition
- One migration toolchain
- Safe forward/backward movement with explicit backfills
- Eliminated ambiguity from duplicate schema modules and legacy SQL tracks

---

## 1) Authoring schema changes
1. Update the canonical schema in:
   - `src/lib/db/schema/index.ts` (exports)
   - `src/lib/db/schema/*.ts` (tables)
2. Ensure there is only one module for each table.

**Rule:** do not maintain parallel files like `artworkStaged.ts` and `artwork_staged.ts` with divergent definitions.
If a legacy import path exists, it must be a *shim* that re-exports canonical.

---

## 2) Generate a migration
```bash
pnpm drizzle-kit generate
This creates a new migration under drizzle/.

3) Apply migrations
pnpm drizzle-kit migrate
4) Backfills (data migrations)
If a schema change requires moving data:

Create a script in scripts/backfills/

Make it idempotent and observable

Backfill requirements
Must be safe to run 2+ times

Must log start/end and counts

Prefer a --dry-run mode when feasible

Run pattern:

node -r dotenv/config scripts/backfills/<file>.js
5) Rollback strategy
Prefer rolling back by restoring from a pre-migration snapshot.

If a rollback is needed:

Revert app code to the previous version.

Restore DB snapshot OR apply reverse migration if available.

Keep compatibility shims (like artworkStaged.ts) if needed to bridge reads.

6) Deprecating legacy SQL tracks
Legacy directories such as:

scripts/sql/*

scripts/sql-migrations/*
are deprecated.

Archival procedure:

Confirm production is healthy on Drizzle migrations

Take a snapshot/backup

Move legacy SQL folders into an archive location (read-only)

7) Migration health checks
Use:

GET /api/admin/migrations/health

Protected by:

header x-migration-health-secret: <MIGRATION_HEALTH_SECRET>

Health should include:

DB connectivity

expected tables present

latest applied migration (if available)

