# 1) EXECUTIVE SUMMARY

## Health scores (0–10)
- correctness: 5
- security: 4
- reliability: 5
- performance: 6
- testability: 4
- operability: 5
- data integrity: 4
- api boundary discipline: 3
- migration safety: 3
- checkout/payments safety: 4

## Top 10 risks (ranked)
1. Two independent Stripe webhook handlers (`/api/stripe/webhook` and `/api/webhooks/stripe`) can diverge business behavior and idempotency paths.
2. Two auth-policy systems (`src/lib/auth.ts` and `src/lib/authzPolicy.ts`) coexist, increasing inconsistent route enforcement risk.
3. Multiple API routes have no shared envelope/error contract, causing unpredictable client behavior and weak operability.
4. Schema export barrel omits many active tables, increasing runtime/schema drift risk.
5. Duplicate schema module variants (snake_case + camelCase) create migration/model drift opportunity.
6. Admin loyalty endpoint imports non-existent auth module and calls `requireAdmin()` without request object.
7. Migration history has duplicate migration number `0002_*` files and legacy SQL tracks, reducing deterministic migration safety.
8. Checkout/payment route family has overlapping endpoints (`create-payment-intent`, `create-checkout-session`, `checkout/start`, `checkout/session`) with inconsistent invariants.
9. Route policy classification is not centrally declared for all routes; middleware protects account pages only, not full API policy model.
10. Test suite currently fails due path alias/import mismatch in Sinalite pricing route integration tests.

## Top 10 quick wins
1. Remove/redirect one Stripe webhook route and canonicalize to single handler + shared domain service.
2. Replace route-local auth checks with single `guardOrReturn(req, {kind})` utility.
3. Publish a single route access matrix generated from code and enforce in CI.
4. Standardize API success/error envelope with `ok()/fail()/apiError()` wrappers.
5. Consolidate schema modules to one canonical filename per table and remove duplicate definitions.
6. Fix `admin/loyalty/adjust` auth import and request passing.
7. Add unique DB constraint for webhook event id or provider/providerId across all order creation paths.
8. Add migration CI check: fresh DB migrate + drift detection + checksum validation.
9. Introduce requestId injection test on all API routes.
10. Fix failing Sinalite integration test import alias and gate merge on green tests.

---

# 2) DOMAIN MAP (GROUP CODE THAT BELONGS TOGETHER)

## Domain inventory

| Domain | Purpose | File paths | DB tables | External deps | Invariants | Critical paths |
|---|---|---|---|---|---|---|
| Auth & Policy Enforcement | AuthN/AuthZ and route access control | `src/middleware.ts`, `src/lib/auth.ts`, `src/lib/authzPolicy.ts`, `src/lib/requireAdmin.ts` | customers, loyalty/admin tables indirectly | Clerk | every route must be `public/auth/admin/cron`; admin non-bypassable | admin APIs, me APIs, cron jobs |
| API Boundary & Validation | Request parsing, response shape, error envelope | `src/lib/apiError.ts`, `src/lib/requestId.ts`, all `src/app/api/**/route.ts` | all | Next.js App Router | inputs validated; consistent `ok/error`; requestId propagated | checkout, uploads, pricing, account APIs |
| Data Layer (DB + schema) | Drizzle schemas and DB access | `src/lib/db.ts`, `src/lib/db/schema/*.ts` | all tables | pg, drizzle-orm | schema canonical, no duplicate models | all write paths |
| Migrations System | Schema evolution and runtime health checks | `drizzle/*.sql`, `drizzle/meta/*`, `docs/migrations-playbook.md`, `scripts/runSqlMigrations.js`, `src/app/api/admin/migrations/health/route.ts` | migration metadata + all tables | drizzle-kit, pg | deterministic, repeatable migrations | deploy/startup, health checks |
| Catalog / Products | Product metadata/resolution and product APIs/pages | `src/lib/catalogLocal.ts`, `src/lib/productResolver.ts`, `src/app/products/**`, `src/app/api/products/**` | sinalite_products, product_reviews | Sinalite, local JSON data | product IDs and option chains resolve deterministically | product → pricing |
| Pricing | Price computation and Sinalite fetch/cache | `src/lib/pricing.ts`, `src/lib/price/compute.ts`, `src/lib/sinalite/**`, `src/app/api/price/**`, `src/app/api/sinalite/price/**` | sinalite_product_pricing, price_tiers, cart_lines | Sinalite | server-authoritative unit/line pricing | PDP/cart pricing refresh |
| Cart | Session cart lifecycle, lines, credits, attachments/artwork links | `src/lib/cartSession.ts`, `src/lib/cartCredits.ts`, `src/app/api/cart/**` | carts, cart_lines, cart_credits, cart_artwork, cart_attachments | cookies, Sinalite | cart totals computed server-side | add line, reprice, shipping selection |
| Shipping & Tax | Shipping choice, estimate, tax capture/reconciliation | `src/lib/mapShipping.ts`, `src/lib/tax.ts`, `src/app/api/cart/shipping/**`, `src/app/api/shipping/route.ts`, `src/app/api/stripe/webhook/tax.ts` | carts, orders | Sinalite shipping, Stripe Tax | totals = subtotal+shipping+tax−credits | cart→checkout |
| Checkout & Payments | Stripe intents/sessions, free checkout finalization, webhook reconciliation | `src/app/api/create-payment-intent/route.ts`, `src/app/api/create-checkout-session/route.ts`, `src/app/api/checkout/**`, `src/lib/checkout.ts`, `src/lib/ordersFromStripe.ts`, webhook routes | carts, cart_lines, cart_credits, orders, order_items | Stripe | Stripe amount server-computed, webhook idempotent | checkout submit → payment → order |
| Orders & Invoicing | Order read, invoice generation, reorder, artwork zip | `src/lib/orders.ts`, `src/app/api/orders/**`, `src/app/account/orders/**`, `src/app/orders/**` | orders, order_items, artwork_uploads | PDF tooling/email | immutable paid order amounts | account orders/invoice/reorder |
| Uploads & Storage | Artwork upload/presign and R2 integration | `src/app/api/uploads/**`, `src/app/api/r2/**`, `src/lib/artwork/**` | artwork_uploads, cart_artwork | Cloudflare R2/S3 | file path normalization; no traversal/unsafe content type | upload pre-checkout and post-checkout |
| Email/Notifications | Transactional emails + cron scan | `src/lib/email/**`, `src/emails/**`, `src/app/api/send-order-confirmation/route.ts`, `src/app/api/jobs/artwork-needed/route.ts` | email_deliveries, orders | Resend | email send idempotency by kind+order | webhook/order finalize -> email |
| Admin | Admin reviews, loyalty adjust, migration health | `src/app/api/admin/**`, `src/app/admin/**` | product_reviews, loyalty_wallets, loyalty_transactions | Clerk/headers secrets | admin-only unless explicit secret endpoint | moderation and ops checks |
| Analytics | Event capture APIs | `src/app/api/analytics/**`, `src/app/api/hero-analytics/route.ts`, `src/lib/*Analytics.ts` | hero_events, guide_download_events(legacy) | internal | avoid PII leakage, bounded payloads | page and CTA tracking |
| Site Meta (robots/sitemap) | Crawl controls and sitemap generation | `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/sitemap-jobs.xml/route.ts` | none | Next metadata API, filesystem | no sensitive URL exposure | SEO surface |
| Observability & Ops | Logging, requestId, health checks | `src/lib/logger.ts`, `src/lib/requestId.ts`, `src/app/api/health/route.ts`, admin migration health | none | console/infra | requestId continuity and structured logs | incident triage |

## DOMAIN DEPENDENCY GRAPH
- Auth & Policy Enforcement -> API Boundary -> (Cart, Pricing, Checkout, Orders, Admin, Uploads, Analytics)
- Data Layer -> all stateful domains
- Migrations System -> Data Layer
- Pricing -> Cart -> Shipping & Tax -> Checkout & Payments -> Orders & Invoicing -> Email
- Uploads & Storage -> Cart + Orders
- Observability & Ops cross-cuts all domains

### Cycles identified
- Cart <-> Pricing (cart reprice endpoint reaches pricing, pricing often keyed by cart option selections).
- Checkout & Payments <-> Orders (checkout builds orders; order handlers sometimes depend on payment provider metadata).

### Boundary violations
- Duplicate auth stacks violate single authority boundary.
- Duplicate Stripe webhook endpoints violate payment boundary single-writer principle.
- Duplicate schema modules violate data model single source of truth.

## FLOW MAPS (with file paths)

### product -> pricing -> cart
- Files: `src/app/products/[productId]/page.tsx`, `src/app/api/price/pricing/route.ts`, `src/app/api/cart/lines/route.ts`, `src/lib/pricing.ts`.
- Invariants: server computes unit price; option chain is normalized; line totals persisted from server.
- Failure modes: stale Sinalite cache, invalid option IDs, client attempting manual price injection.
- Test insertion points: API contract tests for price route; cart line creation rejects mismatched unit/line amounts.

### cart -> shipping/tax -> totals
- Files: `src/app/api/cart/current/route.ts`, `src/app/api/cart/shipping/estimate/route.ts`, `src/app/api/cart/shipping/choose/route.ts`, `src/app/api/create-payment-intent/route.ts`.
- Invariants: selected shipping required before taxable checkout; credits bounded by subtotal.
- Failure modes: missing shipping address for tax calc; negative totals; shipping object shape drift.
- Test insertion points: integration tests for shipping choose + create-payment-intent with/without address.

### checkout -> payment intent/session -> order
- Files: `src/app/api/create-payment-intent/route.ts`, `src/app/api/create-checkout-session/route.ts`, `src/app/api/orders/place/route.ts`, `src/lib/checkout.ts`.
- Invariants: total computed server-side from DB cart lines + shipping + tax - credits.
- Failure modes: overlapping endpoints produce inconsistent totals; order created before payment confirmation.
- Test insertion points: deterministic tests asserting same cart yields same total across endpoint families.

### webhook -> order update -> email
- Files: `src/app/api/stripe/webhook/route.ts`, `src/app/api/webhooks/stripe/route.ts`, `src/lib/ordersFromStripe.ts`, `src/lib/email/sendOrderConfirmationEmail.tsx`.
- Invariants: webhook idempotent; only paid event finalizes order once; email send deduplicated.
- Failure modes: duplicate webhook handlers race; missing unique DB constraint allows duplicate orders.
- Test insertion points: replay same Stripe event id and assert single order + single email delivery row.

### account orders -> invoice -> reorder
- Files: `src/app/api/me/orders/route.ts`, `src/app/api/orders/[id]/invoice/route.ts`, `src/app/api/orders/[id]/reorder/route.ts`, `src/app/account/orders/[id]/**`.
- Invariants: user can access only own order; reorder copies server-side order lines.
- Failure modes: auth gap exposes invoice/reorder cross-user.
- Test insertion points: integration tests with user A/B data isolation.

### admin workflows
- Files: `src/app/api/admin/reviews/route.ts`, `src/app/api/admin/loyalty/adjust/route.ts`, `src/app/api/admin/migrations/health/route.ts`.
- Invariants: admin-only or secret-protected and logged with requestId.
- Failure modes: bypassable route (broken import), inconsistent error shapes.
- Test insertion points: authz matrix tests for admin endpoints.

---

# 3) ROUTE CATALOG

- Full catalog below enumerates every `route.ts` handler found under `src/app/**`.
- Policy class values marked `ASSUMPTION—NOT VERIFIED` where route-local code did not declare explicit policy constant.

|Path|Method(s)|Policy class|Validation|Auth enforcement|File|
|---|---|---|---|---|---|
|/account/orders/[id]/invoice/email|GET,POST|auth|query/path only|clerk auth()|src/app/account/orders/[id]/invoice/email/route.ts|
|/account/orders/[id]/reorder|GET,POST|auth|query/path only|clerk auth()|src/app/account/orders/[id]/reorder/route.ts|
|/api/account/address/upsert|GET,POST|public/mixed|zod/manual|clerk auth()|src/app/api/account/address/upsert/route.ts|
|/api/addresses/[id]|GET,PATCH,DELETE|public/mixed|query/path only|enforcePolicy|src/app/api/addresses/[id]/route.ts|
|/api/addresses/default|PUT|public/mixed|query/path only|enforcePolicy|src/app/api/addresses/default/route.ts|
|/api/addresses|GET,POST|public/mixed|query/path only|enforcePolicy|src/app/api/addresses/route.ts|
|/api/admin/loyalty/adjust|POST|admin|manual/none|requireAdmin|src/app/api/admin/loyalty/adjust/route.ts|
|/api/admin/migrations/health|GET|admin|query/path only|none-detected|src/app/api/admin/migrations/health/route.ts|
|/api/admin/reviews/edit|GET,POST|admin|zod/manual|requireAdmin|src/app/api/admin/reviews/edit/route.ts|
|/api/admin/reviews/export|GET|admin|zod/manual|requireAdmin|src/app/api/admin/reviews/export/route.ts|
|/api/admin/reviews|GET,POST,PUT,DELETE|admin|zod/manual|requireAdmin|src/app/api/admin/reviews/route.ts|
|/api/analytics/careers|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/analytics/careers/route.ts|
|/api/analytics/guide-download|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/analytics/guide-download/route.ts|
|/api/artwork/stage|GET,POST,DELETE|public/mixed|manual/none|none-detected|src/app/api/artwork/stage/route.ts|
|/api/cart/add|POST|public/mixed|zod/manual|none-detected|src/app/api/cart/add/route.ts|
|/api/cart/apply-credit|POST|public/mixed|manual/none|none-detected|src/app/api/cart/apply-credit/route.ts|
|/api/cart/artwork|GET,POST|public/mixed|manual/none|none-detected|src/app/api/cart/artwork/route.ts|
|/api/cart/attachments|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/cart/attachments/route.ts|
|/api/cart/clear-shipping|POST|public/mixed|query/path only|none-detected|src/app/api/cart/clear-shipping/route.ts|
|/api/cart/clear|GET,POST|public/mixed|query/path only|none-detected|src/app/api/cart/clear/route.ts|
|/api/cart/credits|GET|public/mixed|query/path only|none-detected|src/app/api/cart/credits/route.ts|
|/api/cart/current|GET|public/mixed|query/path only|none-detected|src/app/api/cart/current/route.ts|
|/api/cart/lines/[lineId]/artwork|GET,POST,DELETE|public/mixed|manual/none|none-detected|src/app/api/cart/lines/[lineId]/artwork/route.ts|
|/api/cart/lines/[lineId]|PATCH,DELETE|public/mixed|manual/none|none-detected|src/app/api/cart/lines/[lineId]/route.ts|
|/api/cart/lines/ensure|GET,POST|public/mixed|manual/none|none-detected|src/app/api/cart/lines/ensure/route.ts|
|/api/cart/lines/reprice|POST|public/mixed|manual/none|none-detected|src/app/api/cart/lines/reprice/route.ts|
|/api/cart/lines|POST|public/mixed|manual/none|none-detected|src/app/api/cart/lines/route.ts|
|/api/cart|GET|public/mixed|query/path only|none-detected|src/app/api/cart/route.ts|
|/api/cart/shipping/choose|POST|public/mixed|manual/none|none-detected|src/app/api/cart/shipping/choose/route.ts|
|/api/cart/shipping/estimate|POST|public/mixed|zod/manual|none-detected|src/app/api/cart/shipping/estimate/route.ts|
|/api/cart/sinalite/price|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/cart/sinalite/price/route.ts|
|/api/checkout/session|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/checkout/session/route.ts|
|/api/checkout/start|GET,POST|public/mixed|query/path only|none-detected|src/app/api/checkout/start/route.ts|
|/api/create-checkout-session|GET,POST|public/mixed|query/path only|none-detected|src/app/api/create-checkout-session/route.ts|
|/api/create-payment-intent|POST|public/mixed|query/path only|clerk auth()|src/app/api/create-payment-intent/route.ts|
|/api/emails/test-order-confirmation|POST|public/mixed|manual/none|none-detected|src/app/api/emails/test-order-confirmation/route.ts|
|/api/health|GET|public/mixed|query/path only|none-detected|src/app/api/health/route.ts|
|/api/hero-analytics|GET,POST|public/mixed|zod/manual|clerk auth()|src/app/api/hero-analytics/route.ts|
|/api/jobs/artwork-needed|POST|cron|query/path only|enforcePolicy|src/app/api/jobs/artwork-needed/route.ts|
|/api/me/addresses/[id]/default|POST|auth|query/path only|clerk auth()|src/app/api/me/addresses/[id]/default/route.ts|
|/api/me/addresses/[id]|GET,PATCH,DELETE|auth|manual/none|clerk auth()|src/app/api/me/addresses/[id]/route.ts|
|/api/me/addresses|GET,POST|auth|manual/none|clerk auth()|src/app/api/me/addresses/route.ts|
|/api/me/default-address|GET,POST|auth|query/path only|clerk auth()|src/app/api/me/default-address/route.ts|
|/api/me/loyalty/adjust|GET,POST|auth|manual/none|clerk auth()|src/app/api/me/loyalty/adjust/route.ts|
|/api/me/loyalty/history|GET,POST|auth|query/path only|clerk auth()|src/app/api/me/loyalty/history/route.ts|
|/api/me/loyalty/redeem|GET,POST|auth|manual/none|clerk auth()|src/app/api/me/loyalty/redeem/route.ts|
|/api/me/loyalty|GET,POST|auth|query/path only|clerk auth()|src/app/api/me/loyalty/route.ts|
|/api/me/loyalty/wallet|GET,POST,DELETE|auth|query/path only|clerk auth()|src/app/api/me/loyalty/wallet/route.ts|
|/api/me/orders|GET|auth|query/path only|clerk auth()|src/app/api/me/orders/route.ts|
|/api/me/profile|GET|auth|query/path only|clerk auth()|src/app/api/me/profile/route.ts|
|/api/me|GET,POST,PUT|public/mixed|manual/none|clerk auth()|src/app/api/me/route.ts|
|/api/me/shipments|GET|auth|zod/manual|clerk auth()|src/app/api/me/shipments/route.ts|
|/api/me/summary|GET,POST|auth|query/path only|clerk auth()|src/app/api/me/summary/route.ts|
|/api/orders/[id]/artwork.zip|GET|public/mixed|query/path only|clerk auth()|src/app/api/orders/[id]/artwork.zip/route.ts|
|/api/orders/[id]/invoice|GET|public/mixed|query/path only|clerk auth()|src/app/api/orders/[id]/invoice/route.ts|
|/api/orders/[id]/reorder|POST|public/mixed|query/path only|clerk auth()|src/app/api/orders/[id]/reorder/route.ts|
|/api/orders/[id]|GET|public/mixed|query/path only|clerk auth()|src/app/api/orders/[id]/route.ts|
|/api/orders/place|POST|public/mixed|zod/manual|clerk auth()|src/app/api/orders/place/route.ts|
|/api/orders|GET|public/mixed|query/path only|clerk auth()|src/app/api/orders/route.ts|
|/api/price/pricing|GET,POST|public/mixed|manual/none|none-detected|src/app/api/price/pricing/route.ts|
|/api/price|GET,POST,PUT,PATCH,DELETE,OPTIONS|public/mixed|query/path only|none-detected|src/app/api/price/route.ts|
|/api/products/[productId]/reviews|GET,POST|public/mixed|zod/manual|clerk auth()|src/app/api/products/[productId]/reviews/route.ts|
|/api/products/[productId]|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/products/[productId]/route.ts|
|/api/quotes/custom-order|POST|public/mixed|query/path only|enforcePolicy|src/app/api/quotes/custom-order/route.ts|
|/api/quotes/request|POST|public/mixed|query/path only|enforcePolicy|src/app/api/quotes/request/route.ts|
|/api/quotes|POST|public/mixed|manual/none|none-detected|src/app/api/quotes/route.ts|
|/api/r2/health|GET,POST|public/mixed|query/path only|none-detected|src/app/api/r2/health/route.ts|
|/api/r2/presign|GET,POST|public/mixed|manual/none|none-detected|src/app/api/r2/presign/route.ts|
|/api/reviews/[reviewId]/helpful|POST|public/mixed|zod/manual|clerk auth()|src/app/api/reviews/[reviewId]/helpful/route.ts|
|/api/reviews|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/reviews/route.ts|
|/api/send-order-confirmation|POST|public/mixed|zod/manual|clerk auth()|src/app/api/send-order-confirmation/route.ts|
|/api/sessions/ensure|GET,POST|public/mixed|query/path only|none-detected|src/app/api/sessions/ensure/route.ts|
|/api/sessions|GET,POST,DELETE|public/mixed|query/path only|none-detected|src/app/api/sessions/route.ts|
|/api/shipping|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/shipping/route.ts|
|/api/sinalite/orders/[providerId]/shipments|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/sinalite/orders/[providerId]/shipments/route.ts|
|/api/sinalite/price/[productId]|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/sinalite/price/[productId]/route.ts|
|/api/sinalite/price/batch|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/sinalite/price/batch/route.ts|
|/api/sinalite/products/[productId]|GET|public/mixed|zod/manual|none-detected|src/app/api/sinalite/products/[productId]/route.ts|
|/api/stripe/webhook|POST|public+signature|query/path only|none-detected|src/app/api/stripe/webhook/route.ts|
|/api/uploads/put|GET,POST|public/mixed|zod/manual|none-detected|src/app/api/uploads/put/route.ts|
|/api/uploads/r2|GET,POST|public/mixed|manual/none|none-detected|src/app/api/uploads/r2/route.ts|
|/api/webhooks/clerk|GET,POST|public+signature|zod/manual|none-detected|src/app/api/webhooks/clerk/route.ts|
|/api/webhooks/stripe|POST|public+signature|query/path only|none-detected|src/app/api/webhooks/stripe/route.ts|
|/checkout|GET,POST|ASSUMPTION—NOT VERIFIED|query/path only|none-detected|src/app/checkout/route.ts|
|/orders/[id]/invoice|GET|ASSUMPTION—NOT VERIFIED|query/path only|none-detected|src/app/orders/[id]/invoice/route.ts|
|/products/[productId]/reviews/helpful|GET|ASSUMPTION—NOT VERIFIED|query/path only|none-detected|src/app/products/[productId]/reviews/helpful/route.ts|
|/products/[productId]/reviews|GET|ASSUMPTION—NOT VERIFIED|query/path only|none-detected|src/app/products/[productId]/reviews/route.ts|
|/sitemap-jobs.xml|GET|ASSUMPTION—NOT VERIFIED|query/path only|none-detected|src/app/sitemap-jobs.xml/route.ts|

Flagged gaps:
- Missing centralized policy declaration for most routes.
- Validation not uniformly zod-based; many routes parse JSON ad hoc.
- Error envelope inconsistent (`{ok:false,error:string}` vs structured `apiError`).

---

# 4) DATA MODEL & DB CATALOG

## TABLE CATALOG

Physical tables discovered in current migration SQL:

- artwork_uploads
- carts
- cart_artwork
- cart_attachments
- cart_credits
- cart_lines
- customers
- customer_addresses
- loyalty_transactions
- loyalty_wallets
- orders
- price_tiers
- product_reviews
- sinalite_product_metadata
- sinalite_product_options
- sinalite_product_pricing
- sinalite_products
- sinalite_roll_label_content
- sinalite_roll_label_exclusions
- sinalite_roll_label_options
- hero_events
- addresses
- order_items
- order_sessions
- email_deliveries
- quote_requests
- custom_order_requests

High-risk catalog notes:
- `orders`: unique index exists in schema TS for `(provider, provider_id)` but migration verification should confirm it exists in every environment.
- `cart_lines`: no explicit check constraints for non-negative quantity/unit/line totals.
- `cart_credits`: no check constraint preventing negative credits inserted directly.
- `product_reviews`: moderation/auth boundary handled in routes; table has no FK to products (expected for external catalog IDs).
- `email_deliveries`: unique `(kind, order_id)` supports idempotent email sending.

## TRANSACTION + IDEMPOTENCY AUDIT

- Checkout writes:
  - `src/lib/checkout.ts` uses transaction for free-order finalization and cart closure.
  - `src/app/api/orders/place/route.ts` checks existing order before create and writes order/lines; transaction usage present but must assert all related writes are enclosed.
- Order creation from webhook:
  - both Stripe webhook routes include idempotency pre-checks and transactional inserts.
  - risk remains due duplicated handlers and differing amount/tax logic.
- Email sending:
  - `email_deliveries` table exists for idempotency but must ensure all email senders consistently write/read it.
- Migration runner:
  - Drizzle intended as authoritative; legacy SQL runner explicitly deprecated and exits non-zero.

---

# 5) TEST DESIGN (IMPLEMENTABLE)

## 5.1 Test Harness
- Runner: Vitest for unit/integration; Playwright for E2E.
- DB reset: per-suite ephemeral Postgres schema + migration apply + truncate strategy for deterministic integration tests.
- Fixtures/factories: create typed factories for carts/orders/users/addresses.
- External mocks: Stripe SDK mock layer, Sinalite HTTP mock, Resend mock, R2 presign/upload mock.

## 5.2 Unit Tests
- `authzPolicy` and `auth` parity tests (single behavior contract).
- Pricing compute (`src/lib/pricing.ts`, `src/lib/price/compute.ts`) for edge quantities/options.
- Cart totals compute with credits and shipping rounding.
- Tax reconciliation helper tests.
- Path/key sanitization tests for uploads.

## 5.3 Integration Tests
- API routes to cover first:
  - `/api/cart/current`, `/api/cart/lines`, `/api/cart/shipping/choose`, `/api/create-payment-intent`.
  - `/api/stripe/webhook` canonical path only.
  - `/api/admin/*` auth matrix.
  - `/api/uploads/r2`, `/api/r2/presign` invalid content/path traversal vectors.

## 5.4 Contract Tests
- Stripe: webhook signature verify + replay/idempotency.
- Sinalite: pricing and shipping estimate schema contract + timeout/fallback behavior.
- Email: send function payload contract and idempotency via `email_deliveries`.
- Storage: presign response fields and allowed content types/sizes.

## 5.5 E2E Tests (Playwright)
- Guest: product -> cart -> shipping -> payment intent initiation.
- Auth user: checkout success -> account order detail -> invoice route.
- Reorder flow: account order -> reorder edit -> cart restored.
- Admin: reviews list/edit/export (with admin user fixture).

## 5.6 Security Tests
- Auth bypass probes for every admin and me route.
- Cron secret enforcement (`x-cron-secret`, bearer, missing secret).
- Upload safety: reject dangerous filenames/types/oversized files.
- Env leak checks: ensure server secrets never rendered in client bundles.

## 5.7 Data Integrity Tests
- Migration safety: migrate from empty DB in CI.
- Constraint enforcement: negative values and FK violations rejected.
- Drift detection: compare Drizzle schema snapshot vs applied DB.

## 5.8 Testing Gaps
- No comprehensive route auth matrix tests.
- No webhook replay/idempotency integration suite.
- No migration dry-run/fresh-db CI gate.
- Limited integration coverage around checkout and uploads.

---

# 6) FINDINGS

## Issues / opportunities identified

1. **Critical** — Duplicate Stripe webhook implementations.
   - File path: `src/app/api/stripe/webhook/route.ts`, `src/app/api/webhooks/stripe/route.ts`
   - Failure mode: conflicting totals/tax/idempotency logic creates duplicate or inconsistent orders.
   - Fix: deprecate one route; move to single service module and canonical endpoint.
   - Regression test: replay same event against canonical endpoint and assert one order + stable totals.

2. **High** — Dual auth policy frameworks.
   - File path: `src/lib/auth.ts`, `src/lib/authzPolicy.ts`
   - Failure mode: routes enforce different admin/cron semantics; bypass risk.
   - Fix: standardize on `authzPolicy.ts` guard API and remove legacy auth module.
   - Regression test: route policy matrix test over all API paths.

3. **High** — Broken admin loyalty auth import/call.
   - File path: `src/app/api/admin/loyalty/adjust/route.ts`
   - Failure mode: unresolved import or runtime misuse prevents enforcement and/or endpoint crash.
   - Fix: import from `@/lib/requireAdmin` and pass `req`.
   - Regression test: admin adjust endpoint returns 401/403 for non-admin and 200 for admin fixture.

4. **High** — Schema barrel exports partial subset.
   - File path: `src/lib/db/schema/index.ts`
   - Failure mode: model mismatch, missing types, accidental table omission in typed queries.
   - Fix: export all canonical table modules once; remove deprecated duplicate table defs.
   - Regression test: compile-time schema export snapshot test.

5. **High** — Duplicate schema files define same physical table.
   - File path: `src/lib/db/schema/artworkUploads.ts`, `src/lib/db/schema/artwork_uploads.ts` (and other camel/snake pairs).
   - Failure mode: divergent constraints/indexes across imports.
   - Fix: keep canonical snake_case module + shim exports only.
   - Regression test: static lint rule forbidding pgTable duplicate physical name.

6. **Medium** — Migration numbering/track ambiguity.
   - File path: `drizzle/0002_email_deliveries.sql`, `drizzle/0002_quote_and_custom_order_requests.sql`, `archive/legacy-sql/**`.
   - Failure mode: non-deterministic migration history and operator confusion.
   - Fix: consolidate with monotonic migration IDs and archive legacy SQL read-only.
   - Regression test: CI fresh-migrate + checksum verification.

7. **Medium** — API envelope inconsistency.
   - File path: many route handlers under `src/app/api/**`.
   - Failure mode: clients cannot reliably parse errors; observability metadata missing.
   - Fix: route adapter enforcing `ok/requestId/error` schema.
   - Regression test: contract tests for envelope shape across representative routes.

8. **Medium** — Request ID propagation not universally enforced route-local.
   - File path: `src/middleware.ts` and routes that generate their own request ids.
   - Failure mode: broken trace correlation in incidents.
   - Fix: common helper/wrapper to inject x-request-id in every API response.
   - Regression test: integration test asserts response includes `x-request-id` for all API routes.

9. **Medium** — Checkout endpoint proliferation with overlapping responsibilities.
   - File path: `/api/create-payment-intent`, `/api/create-checkout-session`, `/api/checkout/start`, `/api/checkout/session`.
   - Failure mode: inconsistent totals/policy enforcement across payment entrypoints.
   - Fix: one checkout orchestration service and one public initiation route.
   - Regression test: parity test comparing totals across entrypoints for same cart fixture.

10. **Medium** — Current CI test suite red due unresolved alias in Sinalite route integration test.
   - File path: `src/app/api/cart/sinalite/price/route.ts` and `src/app/api/__tests__/sinalite-price.integration.test.ts`.
   - Failure mode: broken CI hides regressions.
   - Fix: correct import path to existing Sinalite client module and keep integration test enabled.
   - Regression test: existing integration suite green in CI.

---

# 7) STAGE PLAN (1–6)

## Stage 1: Repo Stabilization Baseline
- Goal: make test/build/migration baseline deterministic.
- Deliverables: fix broken imports, green unit/integration baseline, remove dead route duplicates behind feature flag.
- Risk reduced: immediate correctness and deploy failure risk.
- Test gates: `pnpm test`, `pnpm typecheck:ci`, fresh DB migrate.
- Rollback plan: revert to last known green tag.
- DoD: CI green with baseline matrix.

## Stage 2: AuthZ + API Boundary Hardening
- Goal: single policy engine and uniform API contract.
- Deliverables: route policy inventory with enforced wrapper; admin/cron guard standardization.
- Risk reduced: auth bypass and inconsistent behavior.
- Test gates: full auth matrix test and envelope contract test.
- Rollback plan: policy wrapper feature-flagged fallback.
- DoD: all routes explicitly classified.

## Stage 3: Data Model + Migration Consolidation
- Goal: one schema source + deterministic migrations.
- Deliverables: remove duplicate schema definitions; monotonic migration chain; schema drift check.
- Risk reduced: migration and data integrity failures.
- Test gates: migrate-from-empty + drift test + rollback simulation.
- Rollback plan: DB snapshot restore and code rollback.
- DoD: migration playbook fully matches repository reality.

## Stage 4: Cart / Pricing / Checkout Reliability
- Goal: unify totals engine and payment orchestration.
- Deliverables: canonical totals module reused by intent/session/webhook/order placement.
- Risk reduced: payment mismatch and duplicate order creation.
- Test gates: deterministic totals parity + webhook idempotency replay suite.
- Rollback plan: keep previous checkout endpoints under kill-switch.
- DoD: one authoritative payment flow.

## Stage 5: Missing routes/pages/components/libs
- Goal: remove obsolete paths and close functional gaps.
- Deliverables: route deprecations, dead code cleanup, missing ownership docs.
- Risk reduced: maintenance load and hidden edge-case bugs.
- Test gates: route snapshot + smoke e2e.
- Rollback plan: reinstate deprecated routes with redirects.
- DoD: route catalog matches product spec.

## Stage 6: Observability + Operational Readiness
- Goal: production diagnostics and SLO readiness.
- Deliverables: structured logs with requestId everywhere, dashboards/alerts, ops runbooks.
- Risk reduced: incident MTTR and silent failures.
- Test gates: synthetic checks and chaos/failure-mode tests.
- Rollback plan: disable new logging sinks; keep existing stdout logs.
- DoD: on-call runbook covers checkout/webhook/migration incidents.

---

# 8) IMMEDIATE NEXT ACTIONS CHECKLIST

## Commands to run
- `pnpm typecheck:ci`
- `pnpm test`
- `pnpm db:migrate`
- `node -r dotenv/config scripts/backfills/<needed>.js --dry-run` (when data backfill is required)

## Tests to write first
- Stripe webhook replay idempotency integration test.
- Full admin/me/cron/public route auth matrix test.
- Totals parity test across checkout endpoints.
- Upload path/content-type security test.

## Blockers to fix first
- Broken import in admin loyalty route.
- Duplicate Stripe webhook endpoint ownership.
- Failing Sinalite integration test import alias.
- Schema duplicate module cleanup plan.

## Smallest safe PRs
1. PR-1: Fix imports/auth call bugs + make tests green.
2. PR-2: Canonicalize Stripe webhook endpoint and add replay tests.
3. PR-3: Auth policy unification wrapper + route tagging.
4. PR-4: Schema module dedupe with no runtime behavior change.

---

# AUDIT SCORING RUBRIC
- correctness: 5
- security: 4
- reliability: 5
- performance: 6
- testability: 4
- data integrity: 4
- observability: 5
- api boundary discipline: 3
- migration safety: 3
- checkout/payments safety: 4

- weakest category: api boundary discipline / migration safety
- strongest category: performance (relative)
- minimum viable production assessment: **functional but inconsistent; unsafe for high-confidence payment scale without Stage 1–3 remediation**.

---

# PRODUCTION BLOCKERS
- Duplicate Stripe webhook handlers and checkout endpoint overlap.
- Inconsistent/missing route policy declarations.
- Schema/migration consolidation not complete.
- Current failing integration tests.

# SAFE TO DEPLOY IF
- One canonical payment/webhook path with tested idempotency is active.
- All routes are explicitly classified and enforced (`public/auth/admin/cron`).
- CI gates pass (tests + typecheck + migration fresh-run).
- Schema and migration tracks are consolidated.

# UNSAFE TO DEPLOY IF
- Both Stripe webhook routes remain active.
- Admin/cron routes remain partially enforced by mixed auth stacks.
- Migration ambiguity persists across duplicate tracks.
- Test suite remains red.
