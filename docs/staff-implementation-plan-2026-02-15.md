# End-to-end Implementation Plan (Staged, Shippable)

## Repo Map Summary

### Major folders and responsibilities
- `src/app`: Next.js App Router pages, route handlers, and page-level composition.
- `src/app/api`: Server route handlers for cart, quotes, uploads, jobs, health, analytics, and email test endpoints.
- `src/lib`: Service/integration layer (auth, environment, DB access, Sinalite, Stripe, cart/order logic, logging).
- `src/lib/db/schema`: Drizzle schema source-of-truth tables and schema barrel.
- `src/components`: UI components, client-side interactions, and route slots.
- `src/types`: Shared domain and API types.
- `scripts`: Ingestion, migration/backfill helpers, and legacy SQL migration scripts.
- `drizzle`: Generated Drizzle SQL migrations + metadata journal.
- `e2e`: Playwright smoke tests.

### Key entry points
- Root layout + providers: `src/app/layout.tsx` (global metadata, Clerk provider, shell composition).
- Request auth gateway: `src/middleware.ts` (Clerk account-route protection + broad matcher).
- Runtime/env bootstrapping: `src/lib/env.ts` and `src/lib/db.ts`.

### API route structure
- Cart cluster under `src/app/api/cart/**` with line/cart/artwork/price/shipping endpoints.
- Supporting domains:
  - Addresses: `src/app/api/addresses/**`
  - Quotes/custom orders: `src/app/api/quotes/**`, `src/app/api/custom-orders/route.ts`
  - Uploads/artwork: `src/app/api/uploads/r2/route.ts`, `src/app/api/artwork/stage/route.ts`
  - Jobs/health/analytics/email test routes.

### Lib/service layers
- Shared infra: `src/lib/env.ts`, `src/lib/db.ts`, `src/lib/logger.ts`, `src/lib/apiError.ts`.
- Commerce domains: cart/order/checkout/address/loyalty modules.
- External integrations: Sinalite modules (multiple variants), Stripe modules, Cloudflare image/R2 modules.
- Auth helpers: both `src/lib/auth.ts` and `src/lib/requireAdmin.ts` (overlap).

### DB schema + migrations approach
- Drizzle is configured as canonical in `drizzle.config.ts` and README guidance.
- Active schema is in `src/lib/db/schema/*` and exported via `src/lib/db/schema/index.ts`.
- Legacy SQL migration runner (`scripts/runSqlMigrations.js`) and legacy migration folders still exist.

### Scripts/cron/backfills
- Sinalite ingest/variant scripts in `scripts/` and `scripts/sinalite/`.
- Legacy and newer SQL migration folders coexist (`scripts/sql*`, `scripts/migrations`, `drizzle`).
- Cron-style artwork-needed job endpoint at `src/app/api/jobs/artwork-needed/route.ts`.

## Issues and Opportunities

### Architecture risks
- Multiple parallel implementations for key concerns (auth/admin, Sinalite server clients, artwork staging schema aliasing) increase drift risk and inconsistent behavior.
- Mixed compatibility shims and deprecated paths are still in active source paths, making ownership and change safety unclear.

### Data integrity risks
- Schema ambiguity around staged artwork (`artworkStaged.ts` alias vs `artwork_staged.ts` table) risks accidental dual-table assumptions.
- Migration strategy is split between Drizzle and multiple SQL script tracks, increasing migration-order and idempotency risk.

### Security/auth boundary gaps
- Middleware only explicitly protects account pages; many API routes rely on per-route checks or none.
- Email test endpoint appears open and should be restricted or removed from production exposure.

### Performance/reliability bottlenecks
- Cart and route handlers often perform runtime fetches and broad no-store behavior with minimal observability instrumentation.
- Potentially brittle env usage via direct `process.env` access in many files rather than normalized typed env access.

### Duplicated logic/inconsistency
- Duplicate admin enforcement logic (`auth.ts` vs `requireAdmin.ts`).
- Duplicate Sinalite server modules and old/new function naming can break mocks and imports.

### Error handling/test gaps
- Test suite currently fails (mock mismatch and request-id expectation mismatch), reducing confidence.
- E2E coverage is only smoke-level for cart/account; checkout/payment/order lifecycle lacks coverage.

---

## Stage 1: Repo Stabilization Baseline (Build/Test/Policy)

- Goal: Establish a green, deterministic baseline by resolving immediate compile/test blockers, normalizing route safety posture, and creating verifiable CI checks so subsequent refactors are safe and mergeable.
- Entry/Exit criteria:
  - Entry: Current branch with failing tests and known route/import inconsistencies.
  - Exit: `pnpm test` passes; a deterministic typecheck/lint path is defined and passing; high-risk public debug/test endpoints are gated or disabled by environment.
- Scope:
  - In-scope items:
    - Fix broken imports/syntax blockers and test expectation drift.
    - Add route-level guardrails for internal/test endpoints.
    - Define stable project checks (lint/typecheck/test commands).
  - Out-of-scope items (explicit):
    - Major domain refactors of cart/Sinalite/order flows.
    - Large schema redesign.
- Files required (MANDATORY; outline only):
  - Existing files to edit:
    - `src/app/api/emails/test-order-confirmation/route.ts`
      - Correct invalid payload construction.
      - Add auth/secret guard and non-production safety gate.
      - Standardize error response shape.
    - `src/app/api/cart/page.tsx`
      - Resolve invalid/missing config import dependency.
      - Keep behavior intact while unblocking build.
    - `src/lib/__tests__/apiError.test.ts`
      - Align request-id format expectations with actual implementation strategy.
    - `src/app/api/__tests__/sinalite-price.integration.test.ts`
      - Fix mock shape to match real exports and route behavior.
    - `package.json`
      - Add explicit typecheck script.
      - Fix lint script compatibility with Next version/tooling.
    - `README.md`
      - Document canonical dev verification commands.
      - Clarify internal/debug route protection policy.
  - New files to create:
    - `src/lib/routeGuards.ts`
      - Central helpers for env/secret gating for internal routes.
  - new pages.tsx that need to be created:
    - None.
  - New API routes that need to be created:
    - None.
  - Files to delete/deprecate (if any):
    - None in this stage.
- Implementation steps:
  1. Resolve compile blocker(s) in test email route and cart page import path.
  2. Add reusable internal-route guard helper.
  3. Apply guard helper to internal/test routes.
  4. Align failing tests and mocks with current interfaces.
  5. Add/repair lint+typecheck scripts and README verification instructions.
  6. Run baseline checks and capture outputs.
  - DB migrations/backfills:
    - None.
  - Env var additions/changes:
    - `INTERNAL_API_SECRET`: shared secret for non-public maintenance/test routes.
    - `ENABLE_TEST_EMAIL_ENDPOINT`: explicit boolean gate for local/staging enablement.
- Testing plan (MANDATORY; outline only):
  - Unit tests:
    - Route guard helper behavior for missing/invalid/valid secret and env gates.
    - `getRequestId` expectations for header-based and generated IDs.
  - Integration tests:
    - `POST /api/cart/sinalite/price` with valid + invalid payloads and mock behavior.
    - test-order-confirmation route unauthorized vs authorized behavior.
  - E2E tests (if applicable):
    - Smoke rerun for existing cart/account specs.
  - Manual verification checklist:
    - Attempt POST to internal route without secret -> 401/403.
    - Retry with secret + enabled env -> success response.
    - Run full unit/integration suite -> green.
  - Test data setup:
    - No DB seed needed; mocked request fixtures for route tests.
- Observability:
  - Add structured warning logs when internal endpoint access is denied.
  - Include requestId in all guarded route error responses.
- Risks and mitigations:
  - Risk: accidentally breaking legitimate internal workflows.
  - Mitigation: env-gated rollout and explicit docs for secret usage.
- Estimated effort:
  - Medium.
- Rollback plan:
  - Revert guarded-route commits and disable new env flags.

## Stage 2: AuthZ + API Boundary Hardening

- Goal: Unify authorization patterns and explicitly classify every API route as public, authenticated, or admin/cron to prevent accidental exposure and reduce duplicated auth logic.
- Entry/Exit criteria:
  - Entry: Stage 1 baseline checks passing.
  - Exit: Single canonical auth helper path used across all protected routes; API access policy matrix documented and enforced by tests.
- Scope:
  - In-scope items:
    - Consolidate admin/user guard utilities.
    - Apply guards across API routes by policy.
    - Add consistent API error envelope usage.
  - Out-of-scope items (explicit):
    - Payment workflow redesign.
- Files required (MANDATORY; outline only):
  - Existing files to edit:
    - `src/lib/auth.ts`
      - Keep as canonical auth/admin utility.
      - Extend helper ergonomics for route-level usage.
    - `src/lib/requireAdmin.ts`
      - Mark deprecated and migrate consumers.
    - `src/middleware.ts`
      - Keep focused matcher intent; avoid accidental route overmatching.
    - `src/lib/apiError.ts`
      - Standardize error codes and requestId propagation helpers.
    - `src/app/api/jobs/artwork-needed/route.ts`
      - Move to shared auth/secret guard pattern.
    - `src/app/api/custom-orders/route.ts`
      - Enforce expected auth mode and standardized errors.
    - `src/app/api/quotes/request/route.ts`
      - Apply explicit input/auth handling standard.
    - `src/app/api/quotes/custom-order/route.ts`
      - Apply explicit input/auth handling standard.
    - `src/app/api/addresses/route.ts`
      - Enforce authenticated user boundary and ownership checks.
    - `src/app/api/addresses/default/route.ts`
      - Enforce authenticated user boundary and ownership checks.
    - `src/app/api/addresses/[id]/route.ts`
      - Enforce authenticated user boundary and ownership checks.
  - New files to create:
    - `docs/api-access-matrix.md`
      - Route-by-route access policy (public/auth/admin/cron/internal).
    - `src/lib/authzPolicy.ts`
      - Policy enums and route policy helpers for consistency.
  - new pages.tsx that need to be created:
    - None.
  - New API routes that need to be created:
    - None.
  - Files to delete/deprecate (if any):
    - `src/lib/requireAdmin.ts` (deprecate now; remove in Stage 5).
- Implementation steps:
  1. Define canonical authz policy model and docs.
  2. Replace direct/duplicate admin checks with centralized helpers.
  3. Update protected routes to enforce declared policy.
  4. Standardize error envelopes and request IDs.
  5. Add policy-focused integration tests per route class.
  - DB migrations/backfills:
    - None.
  - Env var additions/changes:
    - `CRON_SECRET` remains canonical; deprecate aliases gradually.
    - `ADMIN_EMAILS` policy documentation tightened (format + precedence).
- Testing plan (MANDATORY; outline only):
  - Unit tests:
    - Auth policy helper branch coverage (public/auth/admin/internal).
  - Integration tests:
    - Protected routes reject unauthorized requests and accept valid identities.
  - E2E tests:
    - Account flows still redirect/sign-in as expected.
  - Manual verification checklist:
    - Validate representative public/auth/admin/cron endpoint responses.
  - Test data setup:
    - Clerk test user fixtures / mocked auth context.
- Observability:
  - Log authz denials with route, policy, requestId (no PII).
- Risks and mitigations:
  - Risk: accidental lockout for valid admin workflows.
  - Mitigation: phased route rollout + temporary compatibility fallback flag.
- Estimated effort:
  - Medium.
- Rollback plan:
  - Re-enable deprecated helper imports and revert per-route policy commits.

## Stage 3: Data Model + Migration System Consolidation

- Goal: Establish one authoritative schema/migration workflow, remove ambiguous schema aliases, and ensure safe forward/backward migration and backfill discipline.
- Entry/Exit criteria:
  - Entry: Stage 2 auth boundary stable.
  - Exit: Drizzle-only migration path documented and enforced; duplicate/legacy schema paths deprecated with compatibility strategy.
- Scope:
  - In-scope items:
    - Resolve staged artwork schema ambiguity.
    - Formalize migration/backfill standards.
    - Add migration health checks.
  - Out-of-scope items (explicit):
    - Major domain model redesign beyond de-duplication.
- Files required (MANDATORY; outline only):
  - Existing files to edit:
    - `src/lib/db/schema/index.ts`
      - Export single canonical staged-artwork table path.
      - Remove confusing comments/duplicate references.
    - `src/lib/db/schema/artworkStaged.ts`
      - Convert to explicit deprecation shim notes or remove after migration.
    - `src/lib/db/schema/artwork_staged.ts`
      - Decide canonical retention vs merge with uploads and align naming.
    - `drizzle.config.ts`
      - Ensure schema root and strict settings match consolidated approach.
    - `README.md`
      - Replace mixed migration instructions with one production path.
    - `scripts/runSqlMigrations.js`
      - Mark internal-only or deprecate in favor of Drizzle workflow.
    - `scripts/migrations/README.md`
      - Add explicit deprecation and migration archival guidance.
  - New files to create:
    - `docs/migrations-playbook.md`
      - Expand migration authoring/apply/rollback/backfill process.
    - `scripts/backfills/README.md`
      - Convention for one-off backfills with idempotency and observability.
  - new pages.tsx that need to be created:
    - None.
  - New API routes that need to be created:
    - `src/app/api/admin/migrations/health/route.ts`
      - Internal admin endpoint showing schema/migration status summary.
  - Files to delete/deprecate (if any):
    - `scripts/sql-migrations/*` (deprecate; archive after verification).
    - `scripts/sql/*` (deprecate; archive after verification).
- Implementation steps:
  1. Decide canonical table/module names for staged artwork and document compatibility window.
  2. Add Drizzle migration(s) to align schema naming/constraints if needed.
  3. Add idempotent backfill script(s) for data migration.
  4. Update schema exports/imports to canonical path.
  5. Deprecate legacy SQL migration tracks with archival plan.
  6. Add migration health endpoint and checks.
  - DB migrations/backfills:
    - Drizzle migration for canonical staged-artwork representation.
    - Backfill existing staged rows if table/columns changed.
  - Env var additions/changes:
    - `MIGRATION_HEALTH_SECRET`: protect migration health endpoint.
- Testing plan (MANDATORY; outline only):
  - Unit tests:
    - Schema utility and migration-health formatter.
  - Integration tests:
    - Migration health endpoint auth + payload correctness.
    - Data access routes continue functioning with canonical schema.
  - E2E tests:
    - None required beyond smoke unless UI changed.
  - Manual verification checklist:
    - Apply migration on local DB; verify tables/constraints.
    - Execute backfill twice; confirm idempotency.
  - Test data setup:
    - Seed old-format staged-artwork rows to validate transformation.
- Observability:
  - Log migration/backfill start/end counts and error summaries.
- Risks and mitigations:
  - Risk: data loss during schema consolidation.
  - Mitigation: pre-migration snapshot, transactional migration, dry-run backfill mode.
- Estimated effort:
  - Large.
- Rollback plan:
  - Roll back migration to previous snapshot and restore deprecated schema path compatibility shim.

## Stage 4: Cart, Pricing, and Checkout Domain Reliability

- Goal: Make cart/pricing/shipping flows strongly typed, deterministic, and observable, while preserving existing API contracts during migration.
- Entry/Exit criteria:
  - Entry: Stage 3 schema/migration baseline completed.
  - Exit: Cart/pricing critical endpoints have typed request/response contracts, deterministic error handling, and integration coverage for main business cases.
- Scope:
  - In-scope items:
    - Normalize cart API envelope and compatibility strategy.
    - Consolidate Sinalite pricing/shipping adapters and validation paths.
    - Harden upload/artwork attachment flow with ownership checks.
  - Out-of-scope items (explicit):
    - Full storefront search/catalog redesign.
- Files required (MANDATORY; outline only):
  - Existing files to edit:
    - `src/app/api/cart/current/route.ts`
      - Remove implicit any-casts and formalize envelope typing.
      - Split data fetch/transform into testable helpers.
    - `src/app/api/cart/lines/route.ts`
      - Enforce validation, idempotency tokens, and ownership checks.
    - `src/app/api/cart/lines/[lineId]/route.ts`
      - Enforce line ownership and consistent mutation errors.
    - `src/app/api/cart/lines/reprice/route.ts`
      - Stabilize repricing behavior and deterministic fallback rules.
    - `src/app/api/cart/sinalite/price/route.ts`
      - Use canonical Sinalite adapter functions and strict schema validation.
    - `src/app/api/cart/shipping/choose/route.ts`
      - Validate selected shipping against allowed rates snapshot.
    - `src/app/api/uploads/r2/route.ts`
      - Enforce upload intent constraints and content-type/size policy hooks.
    - `src/lib/sinalite/index.ts`
      - Make this the canonical Sinalite interface.
    - `src/lib/sinalite.server.ts`
      - Deprecate legacy surface; maintain temporary compatibility wrapper.
    - `src/lib/sinalite/sinalite.server.ts`
      - Consolidate or redirect to canonical module.
    - `src/lib/price/compute.ts`
      - Migrate imports to canonical Sinalite adapter and typed results.
    - `src/types/api/cart.ts`
      - Define stable cart API contracts for handlers + clients.
    - `src/types/domain/cart.ts`
      - Tighten domain models for line totals, shipping selection, attachments.
  - New files to create:
    - `src/lib/cart/cartService.ts`
      - Encapsulate cart read/write transactional operations.
    - `src/lib/cart/cartValidators.ts`
      - Shared request payload validation and normalization.
    - `src/lib/sinalite/adapter.ts`
      - Single adapter boundary for pricing/options/shipping calls.
    - `src/lib/cart/__tests__/cartService.test.ts`
      - Unit coverage for cart domain logic.
    - `src/app/api/cart/__tests__/lines.integration.test.ts`
      - Integration coverage for line mutations.
  - new pages.tsx that need to be created:
    - None.
  - New API routes that need to be created:
    - `src/app/api/cart/quote/route.ts`
      - Optional pre-checkout snapshot endpoint returning normalized totals + warnings.
  - Files to delete/deprecate (if any):
    - `src/lib/sinalite.server.ts` (remove after compatibility window).
- Implementation steps:
  1. Define typed API schemas for cart line operations and envelope.
  2. Implement cart service layer and refactor handlers to call it.
  3. Consolidate Sinalite adapters and migrate imports.
  4. Add upload intent validation and ownership controls.
  5. Add quote snapshot endpoint for checkout consistency.
  6. Maintain backward-compatible response fields during one release cycle.
  - DB migrations/backfills:
    - Optional: add columns for deterministic pricing snapshot/version hash on cart lines.
    - Backfill existing cart lines with null-safe default snapshot metadata.
  - Env var additions/changes:
    - `CART_REPRICE_STRICT_MODE`: enables strict repricing enforcement with fallback toggle.
    - `R2_MAX_UPLOAD_BYTES`: configurable upload size limit.
- Testing plan (MANDATORY; outline only):
  - Unit tests:
    - Cart total calculation, quantity normalization, pricing snapshot merge rules.
  - Integration tests:
    - Cart line create/update/delete/reprice endpoints.
    - Upload presign endpoint validates payload and issues deterministic keys.
  - E2E tests:
    - Add-to-cart → update quantity → choose shipping → review totals flow.
  - Manual verification checklist:
    - Validate cart totals remain stable after repricing and refresh.
    - Validate unauthorized line mutation is rejected.
  - Test data setup:
    - Seed products/options and cart fixtures with multi-line + attachment cases.
- Observability:
  - Add structured logs for repricing decisions and shipping selection updates.
  - Add metrics for cart mutation failures and Sinalite dependency latency.
- Risks and mitigations:
  - Risk: cart regressions under concurrent updates.
  - Mitigation: transactional updates + idempotency key strategy + compatibility fields.
- Estimated effort:
  - Large.
- Rollback plan:
  - Disable strict mode feature flag and revert handlers to legacy adapter path.

## Stage 5: Quality, Observability, and Operational Readiness

- Goal: Raise confidence and operability via layered test coverage, standardized telemetry, and runbooks; then remove deprecated compatibility shims safely.
- Entry/Exit criteria:
  - Entry: Core flows stable through Stage 4.
  - Exit: Critical route/service test matrix passes in CI; alerting/log conventions documented; deprecated modules removed.
- Scope:
  - In-scope items:
    - Expand high-value tests.
    - Add consistent logging/metrics/tracing conventions.
    - Remove deprecated modules and finalize docs.
  - Out-of-scope items (explicit):
    - Net-new product features.
- Files required (MANDATORY; outline only):
  - Existing files to edit:
    - `src/lib/logger.ts`
      - Add logger context helpers and standardized event names.
    - `src/lib/apiError.ts`
      - Enforce consistent error code taxonomy.
    - `playwright.config.ts`
      - Configure reliable CI retries/timeouts/tracing artifacts.
    - `e2e/cart.spec.ts`
      - Expand into checkout-ready critical path assertions.
    - `e2e/account.spec.ts`
      - Expand authenticated account order visibility assertions.
    - `README.md`
      - Add production runbook links and incident response basics.
    - `src/lib/requireAdmin.ts`
      - Remove once all imports migrated.
    - `src/lib/sinalite.server.ts`
      - Remove legacy shim after migration completion.
  - New files to create:
    - `docs/observability-runbook.md`
      - Logging keys, dashboards, alerts, and on-call triage steps.
    - `docs/testing-strategy.md`
      - Unit/integration/e2e ownership and minimum coverage policy.
    - `src/test/fixtures/cartFixtures.ts`
      - Shared test fixtures for cart/order flows.
    - `src/test/fixtures/authFixtures.ts`
      - Shared auth context fixtures.
  - new pages.tsx that need to be created:
    - None.
  - New API routes that need to be created:
    - `src/app/api/ops/health/dependencies/route.ts`
      - Internal dependency health rollup for DB/Sinalite/Stripe/R2.
  - Files to delete/deprecate (if any):
    - `src/lib/requireAdmin.ts` (delete).
    - `src/lib/sinalite.server.ts` (delete).
- Implementation steps:
  1. Standardize log/event/error taxonomy.
  2. Expand integration + E2E suites for business-critical paths.
  3. Add fixtures and CI stability tuning.
  4. Publish observability/testing runbooks.
  5. Remove deprecated compatibility modules after import audit.
  - DB migrations/backfills:
    - None expected unless telemetry persistence tables are introduced.
  - Env var additions/changes:
    - `LOG_CORRELATION_HEADER`: preferred inbound correlation header override.
    - `OPS_HEALTH_SECRET`: protect ops health route.
- Testing plan (MANDATORY; outline only):
  - Unit tests:
    - Logger/event formatting and error-code mapping.
  - Integration tests:
    - Ops health and critical API route error-path assertions.
  - E2E tests:
    - End-to-end guest cart to checkout handoff (or checkout-init) and account order flow.
  - Manual verification checklist:
    - Validate dashboards/log streams show requestId correlation.
    - Exercise ops health route with and without secret.
  - Test data setup:
    - Deterministic fixtures for products/carts/users/orders in CI.
- Observability:
  - Emit structured lifecycle events for cart mutation, pricing fetch, quote creation, and order finalization.
  - Add dependency latency/error counters and route-level success/error ratios.
- Risks and mitigations:
  - Risk: test flakiness slows delivery.
  - Mitigation: deterministic fixtures, retry budget, and test isolation strategy.
- Estimated effort:
  - Medium.
- Rollback plan:
  - Keep deprecated module removal in isolated commits for quick revert; disable new ops endpoint via env flag if needed.

---

## Master Checklist
- [x] Stage 1 baseline stabilized and checks green.
- [x] Stage 2 authz model unified and route policy matrix enforced.
- [ ] Stage 3 schema/migration workflow consolidated and legacy migration paths deprecated.
- [ ] Stage 4 cart/pricing/upload domain hardened with typed contracts and compatibility strategy.
- [ ] Stage 5 observability/testing maturity complete and deprecated modules removed.

## Dependency Map
- Stage 1 -> prerequisite for all subsequent stages.
- Stage 2 depends on Stage 1.
- Stage 3 depends on Stage 2 (shared route/policy confidence).
- Stage 4 depends on Stage 3 (stable schema + migration discipline).
- Stage 5 depends on Stage 4 (stabilized domain flows).

## Test Matrix (Stages × test type)
- Stage 1: Unit ✓ | Integration ✓ | E2E △ (smoke) | Manual ✓
- Stage 2: Unit ✓ | Integration ✓ | E2E ✓ (auth flows) | Manual ✓
- Stage 3: Unit △ | Integration ✓ | E2E – | Manual ✓
- Stage 4: Unit ✓ | Integration ✓ | E2E ✓ | Manual ✓
- Stage 5: Unit ✓ | Integration ✓ | E2E ✓ | Manual ✓

## First 10 commits (outline only)
1. Commit intent: Baseline verification scripts and docs normalization
   - Files: `package.json`, `README.md`
2. Commit intent: Internal/test endpoint guardrails
   - Files: `src/lib/routeGuards.ts`, `src/app/api/emails/test-order-confirmation/route.ts`
3. Commit intent: Fix immediate compile/import blockers
   - Files: `src/app/api/cart/page.tsx`
4. Commit intent: Repair failing unit/integration tests
   - Files: `src/lib/__tests__/apiError.test.ts`, `src/app/api/__tests__/sinalite-price.integration.test.ts`
5. Commit intent: Auth policy model + API access matrix
   - Files: `src/lib/authzPolicy.ts`, `docs/api-access-matrix.md`, `src/lib/auth.ts`
6. Commit intent: Route-by-route auth policy adoption (batch 1)
   - Files: `src/app/api/addresses/route.ts`, `src/app/api/addresses/default/route.ts`, `src/app/api/addresses/[id]/route.ts`
7. Commit intent: Route-by-route auth policy adoption (batch 2)
   - Files: `src/app/api/quotes/request/route.ts`, `src/app/api/quotes/custom-order/route.ts`, `src/app/api/jobs/artwork-needed/route.ts`
8. Commit intent: Migration strategy consolidation docs + schema export cleanup
   - Files: `README.md`, `docs/migrations-playbook.md`, `src/lib/db/schema/index.ts`, `scripts/migrations/README.md`
9. Commit intent: Cart service extraction and typed validators
   - Files: `src/lib/cart/cartService.ts`, `src/lib/cart/cartValidators.ts`, `src/app/api/cart/current/route.ts`, `src/types/api/cart.ts`
10. Commit intent: Sinalite adapter consolidation + compatibility migration
   - Files: `src/lib/sinalite/adapter.ts`, `src/lib/sinalite/index.ts`, `src/lib/price/compute.ts`, `src/lib/sinalite.server.ts`
