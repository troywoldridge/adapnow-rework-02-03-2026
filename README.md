# AdapNow

Next.js e-commerce app with Sinalite integration, deployed to Cloudflare.

---

## Repo verification (canonical)

These commands define the deterministic baseline for development and CI.

Run the full verification suite:

```bash
pnpm verify
Run individually:

pnpm lint:ci
pnpm typecheck
pnpm test
pnpm build
What verify does
pnpm verify runs:

pnpm lint:ci (lint must pass with zero warnings)

pnpm typecheck (TypeScript must pass with no emit)

pnpm test (Vitest unit/integration tests)

Internal/debug route protection policy
Some endpoints are intentionally internal (diagnostics, test email sends, etc.).
These routes must be protected to avoid accidental public access.

Policy:

Internal/debug routes are disabled in production by default unless explicitly enabled.

Internal/debug routes require a shared secret:

Env: INTERNAL_API_SECRET

Request header: x-internal-secret: <secret>

(Optional for local tooling) Query: ?secret=<secret>

Error responses must be consistent JSON:

{ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "...", "details": null } }
Required envs for internal routes
INTERNAL_API_SECRET (recommended for all environments; required in prod if any internal routes are enabled)

Database
Schema is managed by Drizzle ORM. Source of truth: src/lib/db/schema/.

Migration workflow
Generate migrations after schema changes:

DATABASE_URL=postgresql://... pnpm db:generate
Apply migrations (production/preview):

DATABASE_URL=postgresql://... pnpm db:migrate
Push schema directly (development only – skips migration files):

DATABASE_URL=postgresql://... pnpm db:push
Legacy scripts/migrations/*.sql are deprecated; use Drizzle migrations instead.

Tests
pnpm test
Unit and integration tests use Vitest. Integration tests mock server-only, DB, and Sinalite. For tests requiring a real DB, set DATABASE_URL or TEST_DATABASE_URL.

Getting Started
Read the documentation at https://opennext.js.org/cloudflare.

Develop
Run the Next.js development server:

pnpm dev
Open http://localhost:3000 with your browser to see the result.

Preview
Preview the application locally on the Cloudflare runtime:

pnpm preview
Deploy
Deploy the application to Cloudflare:

pnpm deploy
See .env.example for required environment variables. Key vars include:

DATABASE_URL

SINALITE_CLIENT_ID

SINALITE_CLIENT_SECRET

STRIPE_SECRET_KEY

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

CLERK_SECRET_KEY

Health Check
GET /api/health
Returns 200 when DB is reachable; 503 when DB is down. Optionally checks Sinalite connectivity (sinalite: "ok" | "skip" | "error"). Set LOG_LEVEL (debug | info | warn | error) to control log verbosity.

Scripts
Script	Purpose
pnpm dev	Start dev server
pnpm build	Build for production
pnpm lint	Run Next lint
pnpm lint:ci	Lint with zero warnings
pnpm typecheck	TypeScript typecheck (no emit)
pnpm verify	Lint + typecheck + tests
pnpm db:generate	Generate Drizzle migration
pnpm db:migrate	Apply migrations
pnpm db:push	Push schema (dev only)
pnpm db:studio	Drizzle Studio
pnpm sinalite:auth	Authenticate to Sinalite
pnpm sinalite:ingest	Ingest products from Sinalite (loads env via dotenv/config)
pnpm sinalite:ingest:dry	Ingest products (dry run)
pnpm sinalite:variants	Capture Sinalite variants
pnpm test	Run unit/integration tests
pnpm test:watch	Run Vitest in watch mode
pnpm e2e	Run Playwright E2E tests
pnpm preview	Local Cloudflare runtime preview
pnpm deploy	Build + deploy to Cloudflare
pnpm upload	Build + upload to Cloudflare
Learn More
To learn more about Next.js, take a look at:

Next.js Documentation: https://nextjs.org/docs

Learn Next.js: https://nextjs.org/learn

Next.js GitHub: https://github.com/vercel/next.js
