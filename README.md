# AdapNow

Next.js e-commerce app with Sinalite integration, deployed to Cloudflare.

---

## Repo Verification (Canonical)

These commands define the deterministic baseline for development and CI.

### Run the full verification suite

```bash
pnpm verify
Run individually
pnpm lint:ci
pnpm typecheck
pnpm test
pnpm build
What verify does
The verify script runs the following checks:

pnpm lint:ci → Lint must pass with zero warnings

pnpm typecheck → TypeScript must pass with no emit

pnpm test → Vitest unit/integration tests must pass

Internal / Debug Route Protection Policy
Some endpoints are intentionally internal (diagnostics, test email sends, etc.).
These routes must never be publicly accessible.

Rules
Internal/debug routes are disabled in production by default

Internal/debug routes require a shared secret

All internal routes must return a consistent error shape

Secret requirements
Environment variable:

INTERNAL_API_SECRET
Request options:

x-internal-secret: <secret>
Optional (local tooling):

?secret=<secret>
Error response format
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "...",
    "details": null
  }
}
Database
Schema is managed by Drizzle ORM.

Source of truth:

src/lib/db/schema/
Migration workflow
Generate migrations:

DATABASE_URL=postgresql://... pnpm db:generate
Apply migrations:

DATABASE_URL=postgresql://... pnpm db:migrate
Push schema directly (development only):

DATABASE_URL=postgresql://... pnpm db:push
Legacy SQL migrations in scripts/migrations/ are deprecated.

Tests
Run tests:

pnpm test
Unit and integration tests use Vitest.

Integration tests mock:

server-only

database

Sinalite API

For DB-backed tests, set:

DATABASE_URL
or

TEST_DATABASE_URL
Develop
Start the dev server:

pnpm dev
Open:

http://localhost:3000
Preview (Cloudflare runtime)
pnpm preview
Deploy
pnpm deploy
Required environment variables (see .env.example):

DATABASE_URL

SINALITE_CLIENT_ID

SINALITE_CLIENT_SECRET

STRIPE_SECRET_KEY

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

CLERK_SECRET_KEY

Health Check
GET /api/health
Returns:

200 when DB is reachable

503 when DB is unavailable

Optional Sinalite connectivity check:

sinalite: "ok" | "skip" | "error"
Log level can be configured via:

LOG_LEVEL=debug|info|warn|error
Scripts
Script	Purpose
pnpm dev	Start dev server
pnpm build	Production build
pnpm lint	Run Next lint
pnpm lint:ci	Lint with zero warnings
pnpm typecheck	TypeScript typecheck
pnpm verify	Lint + typecheck + tests
pnpm db:generate	Generate Drizzle migration
pnpm db:migrate	Apply migrations
pnpm db:push	Push schema (dev only)
pnpm db:studio	Drizzle Studio
pnpm sinalite:auth	Authenticate to Sinalite
pnpm sinalite:ingest	Ingest Sinalite products
pnpm sinalite:ingest:dry	Dry-run ingestion
pnpm sinalite:variants	Capture Sinalite variants
pnpm test	Run tests
pnpm test:watch	Vitest watch mode
pnpm e2e	Playwright E2E tests
pnpm preview	Cloudflare preview runtime
pnpm deploy	Deploy to Cloudflare
pnpm upload	Upload to Cloudflare
Learn More
Next.js resources:

https://nextjs.org/docs

https://nextjs.org/learn

https://github.com/vercel/next.js

---

## Migrations (AUTHORITATIVE)

This project uses **Drizzle** as the **only** supported migration workflow.

### Generate a migration
1. Update schema in `src/lib/db/schema/*` (canonical exports in `src/lib/db/schema/index.ts`)
2. Generate migration:

```bash
pnpm drizzle-kit generate

Apply migrations

Apply pending migrations to the configured database:

pnpm drizzle-kit migrate

Rules

Do not apply raw SQL migrations from legacy folders (scripts/sql, scripts/sql-migrations) in production.

Backfills must be idempotent, logged, and safe to re-run.

Schema changes that require data transformation must include:

a Drizzle migration (DDL)

a backfill script (DML) under scripts/backfills/

Backfills

See:

docs/migrations-playbook.md

scripts/backfills/README.md

Admin migration health endpoint

An internal endpoint is available:

GET /api/admin/migrations/health

Requires header: x-migration-health-secret: <MIGRATION_HEALTH_SECRET>

Returns:

Whether expected tables exist

Latest applied migration (if Drizzle migration table is present)

Basic DB connectivity status

