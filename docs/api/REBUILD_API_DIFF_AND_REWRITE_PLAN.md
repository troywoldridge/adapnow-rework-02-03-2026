# Rebuild API Diff + Rewrite Plan (Old tree ➜ New tree)

Troy — here’s the **exact compare** between Tree 1 (old) and Tree 2 (rebuild), plus a **rewrite plan** to make everything correct + future-proof.

---

## 1) What’s already migrated (or replaced) ✅

### Addresses / profile / account-ish
- **Old:** `/api/me/addresses/*`, `/api/me/default-address`, `/api/account/address/upsert`
- **New:** `/api/addresses/*`, `/api/me/profile`, `/api/me/orders`
  - ✅ Address management exists now as `/addresses`, which is cleaner and more “API standard”.

### Cart core
- **Old:** `/api/cart/*` (current, lines, reprice, credits, apply-credit, artwork)
- **New:** `/api/cart/*` (current, lines, reprice, credits, apply-credit, artwork)
  - ✅ Most cart essentials are present.

### Orders core
- **Old:** `/api/orders`, `/api/orders/[id]`, `/api/orders/[id]/reorder`
- **New:** `/api/orders`, `/api/orders/[id]`, `/api/orders/[id]/reorder`
  - ✅ Core order reads + reorder survived.

### Stripe webhook
- **Old:** `/api/webhooks/stripe` AND `/api/stripe/webhook`
- **New:** `/api/webhooks/stripe`
  - ✅ Consolidated to one endpoint (good).

### Uploads (partial)
- **Old:** `/api/uploads/r2`, plus presign/put/health
- **New:** `/api/uploads/r2`
  - ✅ R2 upload endpoint exists (but old had more supporting endpoints).

### Analytics
- **Old:** `/api/analytics/guide-download`
- **New:** `/api/analytics/guide-download`
  - ✅ Kept.

---

## 2) New endpoints added in rebuild (not in old) 🆕
These are rebuild-only and should be kept (with upgrades/rewrites as needed):

- `/api/health`
- `/api/admin/migrations/health` (+ tests)
- `/api/artwork/stage` (replaces old upload flow pattern)
- `/api/jobs/artwork-needed`
- `/api/emails/test-order-confirmation`
- `/api/quotes/*` (quotes + custom orders moved into a proper namespace)
- `/api/orders/[id]/invoice` (new invoice route)

---

## 3) Old endpoints missing from rebuild (needs decision) ⚠️

### A) Shipping (BIG GAP)
**Old shipping footprint:**
- `/api/shipping`
- `/api/cart/shipping/estimate`
- `/api/cart/shipping/choose`
- `/api/cart/choose-shipping`
- `/api/me/shipments` (+ test)

**New shipping footprint:**
- `/api/cart/shipping/choose`
- ✅ also: `/api/cart/clear-shipping` (new)
- ✅ missing: `/api/cart/shipping/estimate` (or equivalent)
- ✅ missing: `/api/shipping` (top-level)
- ✅ missing: `/api/me/shipments`

**Verdict:** shipping is only half-migrated. We still need **estimate + shipment listing** endpoints.

---

### B) Checkout / session / payment flows (mostly missing)
**Old had:**
- `/api/checkout`
- `/api/checkout/start`
- `/api/checkout/session`
- `/api/create-checkout-session`
- `/api/create-payment-intent` ✅ (new still has)
- `/api/sessions` + `/api/sessions/ensure`
- `/api/orders/place`
- `/api/send-order-confirmation`

**New has:**
- `/api/create-payment-intent` ✅
- `/api/emails/test-order-confirmation` (test-only, not production replacement)
- ✅ missing: checkout/session creation endpoints
- ✅ missing: orders/place
- ✅ missing: sessions/ensure
- ✅ missing: send-order-confirmation (production)

**Verdict:** rebuild currently has **PaymentIntent** but is missing the rest of the “checkout pipeline” API surface.

---

### C) Products + Reviews (missing entirely)
**Old had:**
- `/api/products/[productId]`
- `/api/products/[productId]/reviews`
- `/api/reviews`
- `/api/reviews/[reviewId]/helpful`
- `/api/admin/reviews/*` (edit/export/root)

**New has:**
- ✅ /api/products/[productId]
- ✅ /api/products/[productId]/reviews
- ✅ /api/reviews
- ✅ /api/reviews/[reviewId]/helpful
- ✅ /api/admin/reviews/* (edit/export/root)

**Verdict:** this is a full re-add/rewrite if reviews/products are still a feature in the rebuild.

---

### D) Loyalty wallet endpoints (user-facing)
**Old had:**
- `/api/loyalty/wallet`
- `/api/me/loyalty/*` (wallet, redeem, adjust, history, etc.)

**New has:**
- `/api/admin/loyalty/adjust` ✅ (admin)
- ✅ missing: user wallet, redeem/history, etc.

**Verdict:** rebuild currently supports **admin adjustment** but not the user-facing wallet endpoints.

---

### E) Sinalite coverage is reduced
**Old had:**
- `/api/sinalite/price/[productId]`
- `/api/sinalite/price/batch`
- `/api/sinalite/products/[productId]`
- `/api/sinalite/orders/[providerId]/shipments`

**New has:**
- `/api/cart/sinalite/price` ✅ (cart-scoped)
- ✅ missing: batch pricing
- ✅ missing: product fetch route
- ✅ missing: order shipment fetch route

**Verdict:** rebuild intentionally narrowed Sinalite API to “cart pricing” only — if you still need the other operations, we restore them cleanly under `/api/sinalite/*`.

---

### F) Admin/dev/debug endpoints removed
**Old had:**
- `/api/_debug/env`
- `/api/dev/*` (db-health, seed-order-session, algolia-ping)
- `/api/hero-analytics`
- `/api/webhooks/clerk`

**New has:**
- `/api/admin/migrations/health` ✅ (real admin health)
- `/api/health` ✅
- ✅ removed: debug env/dev routes/hero analytics/clerk webhook

**Verdict:** removing most of these is good. If you still need any, we bring them back as **admin-only** routes with secrets + tests.

---

## 4) Rewrite priority plan (future-proof + correct) 🧭

### Phase 1 — Finish the “critical commerce loop”
1) **Shipping estimate endpoint**
   - Add: `/api/cart/shipping/estimate`
   - Contract: input address/cart id/weight, returns carrier/method/cost/days/currency
   - Must match how your cart review page expects shipping totals.

2) **Checkout pipeline endpoints**
   - Decide whether you still need:
     - `/api/checkout/start`
     - `/api/checkout/session`
     - `/api/orders/place`
     - `/api/sessions/ensure`
   - If yes: rewrite them using the new auth/policy model + requestId logging.

3) **Send order confirmation (production)**
   - Replace “test-order-confirmation” with a real:
     - `/api/orders/[id]/email/confirmation` OR `/api/emails/order-confirmation`
   - Should use your centralized email outbox flow (Resend) and be idempotent.

---

### Phase 2 — Restore “user account completeness”
4) **/me/shipments**
   - Re-add: `/api/me/shipments`
   - Should read shipments from DB (and optionally enrich from Sinalite if needed).

5) **Loyalty wallet user endpoints**
   - Re-add under `/api/me/loyalty/*` (or `/api/loyalty/*` but consistent)
   - At minimum:
     - GET wallet balance + credits
     - POST redeem (if supported)
     - GET history

---

### Phase 3 — Optional features (only if rebuild still uses them)
6) **Products API**
   - Re-add `/api/products/[productId]` (and maybe listing endpoints)
   - If the rebuild is a catalog-lite experience, this may be intentionally gone.

7) **Reviews API + admin reviews**
   - Re-add only if reviews are still used.
   - If not, leave removed.

---

### Phase 4 — Sinalite expansion (only if needed)
8) **Restore /api/sinalite/** routes
   - Bring back:
     - `/api/sinalite/price/batch`
     - `/api/sinalite/products/[productId]`
     - `/api/sinalite/orders/[providerId]/shipments`
   - Wrap with:
     - strict input validation
     - upstream timeout + retries
     - caching where appropriate

---

## 5) “Rewrite rules” for every route (so they stay future-proof)
When we rewrite any missing/legacy route, we’ll enforce:

- **Canonical auth policy** (public/auth/admin/cron) using your shared guard
- **RequestId** on every response + structured logs
- **Zod validation** for all inputs (query/body/params)
- **Idempotency** where relevant (checkout, email sends, payment steps)
- **Consistent error envelope** (same shape everywhere)
- **No surprise side effects** in GET routes
- **Tests for each critical route** (at least 1 happy path + 1 auth failure + 1 validation failure)

---

## 6) Concrete “still need to rewrite” checklist ✅/❌

### Must-have (commerce loop)
- ❌ `/api/cart/shipping/estimate`
- ❌ `/api/checkout/start`
- ❌ `/api/checkout/session`
- ❌ `/api/orders/place`
- ❌ `/api/sessions/ensure`
- ❌ production order confirmation sender route (not test)

### Account completeness
- ❌ `/api/me/shipments`
- ❌ `/api/me/loyalty/*` (wallet/history/redeem)

### Optional (only if still needed)
- ❌ `/api/products/[productId]`
- ❌ `/api/products/[productId]/reviews`
- ❌ `/api/reviews/*`
- ❌ `/api/admin/reviews/*`

### Sinalite expansion (only if needed)
- ❌ `/api/sinalite/price/batch`
- ❌ `/api/sinalite/products/[productId]`
- ❌ `/api/sinalite/orders/[providerId]/shipments`

