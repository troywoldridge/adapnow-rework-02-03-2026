# Missing Files Audit (Next.js App Router)

This report lists **repo-local missing references** detected via static import resolution and route/path reference checks.

## Missing lib files

- `src/lib/authz.ts` (imported as `@/lib/authz`)
- `src/lib/cf.ts` (imported as `@/lib/cf`)
- `src/lib/sendEmail.ts` (imported as `@/lib/sendEmail`)
- `src/lib/analyticsClient.ts` (imported as `@/lib/analyticsClient`)
- `src/lib/sinalite.client.ts` (imported as `@/lib/sinalite.client`)
- `src/lib/sinalite.server.ts` (imported as `@/lib/sinalite.server`)
- `src/lib/sinalite.pricing.ts` (imported as `@/lib/sinalite.pricing`)
- `src/lib/sinalite.pricing-local.ts` (imported as `@/lib/sinalite.pricing-local`)
- `src/lib/sinalite.pricing-server.ts` (imported as `@/lib/sinalite.pricing-server`)
- `src/lib/heroSlides.types.ts` (imported as `./heroSlides.types` from `src/lib/heroSlides.ts`)
- `src/lib/sinalite/sinalite.client.ts`
- `src/lib/sinalite/sinalite.placeOrder.ts`
- `src/lib/sinalite/sinalite.pricing.ts`
- `src/lib/sinalite/sinalite.product.ts`
- `src/lib/sinalite/sinalite.server.ts`
- `src/lib/sinalite/sinalite.validateOptions.ts`

### Missing DB schema lib files
- `src/lib/db/schema/loyalty.ts`
- `src/lib/db/schema/productReviews.ts`
- `src/lib/db/schema/reviews.ts`
- `src/lib/db/schema/cart_attachments.ts`
- `src/lib/db/schema/cart_lines.ts`
- `src/lib/db/schema/carts.ts`
- `src/lib/db/schema/customers.ts`
- `src/lib/db/schema/email_deliveries.ts`
- `src/lib/db/schema/email_outbox.ts`
- `src/lib/db/schema/guide_download_events.ts`
- `src/lib/db/schema/order_items.ts`
- `src/lib/db/schema/products.ts`
- `src/lib/db/schema/users.ts`

## Missing components

- `src/components/Stars.tsx` (imported as `@/components/Stars`)
- `src/components/CartSummary.tsx` at root alias path (imports use `@/components/CartSummary`; existing file is under `src/components/cart/CartSummary.tsx`)
- `src/components/CartLineItem.tsx` (same root-path mismatch pattern)
- `src/components/CartShippingEstimator.tsx` (same root-path mismatch pattern)
- `src/components/CartArtworkThumb.tsx` (same root-path mismatch pattern)
- `src/components/CartCreditsRow.tsx` (same root-path mismatch pattern)
- `src/components/AddAnotherSideButton.tsx` (same root-path mismatch pattern)
- `src/components/ChangeShippingButton.tsx` (same root-path mismatch pattern)
- `src/components/SubcategoryTileImage.tsx` (existing file is under `src/components/subcategories/SubcategoryTileImage.tsx`)
- `src/components/CheckoutPaymentElement.tsx` (existing file is under `src/components/stripe/CheckoutPaymentElement.tsx`)
- `src/components/FeaturedCategories.tsx` (existing file is under `src/components/featured/FeaturedCategories.tsx`)
- `src/components/ArtworkUploadBoxes.tsx` (existing file is under `src/components/artwork/ArtworkUploadBoxes.tsx`)
- `src/components/ProductGrid.tsx` (existing file is under `src/components/product/ProductGrid.tsx`)
- `src/components/SearchBar.tsx` (existing file is under `src/components/search/SearchBar.tsx`)
- `src/components/account/HeaderAuth.tsx`
- `src/components/ClientToastHub.tsx`
- `src/components/HashToast.tsx`
- `src/components/product/ProductInfoTabs.tsx`
- `src/components/cart/ShippingEstimator.tsx` (imported by `src/components/cart/index.ts` as `./ShippingEstimator`)
- `src/app/HomeShellClient.tsx` (imported from `src/app/page.tsx` as `./HomeShellClient`)

## Missing API routes

Detected as fetch targets without corresponding `src/app/**/route.ts`:

- `src/app/api/cart/estimate-shipping/route.ts` (referenced by hooks)
- `src/app/api/custom-orders/route.ts`
- `src/app/api/session/ensure/route.ts`
- `src/app/api/uploads/presign/route.ts`

## Missing pages

Detected as `href="..."` paths without corresponding `src/app/**/page.tsx`:

- `src/app/account/security/manage/page.tsx`
- `src/app/contact/form/page.tsx`
- `src/app/quote/page.tsx`
- `src/app/rewards/page.tsx`
- `src/app/sample-kits/page.tsx`
- `src/app/search/page.tsx`
- `src/app/shipping-info/page.tsx`
- `src/app/support/chat/page.tsx`
- `src/app/support/ticket/page.tsx`

## Notes

- Third-party package missing modules (e.g. `stripe`, `swr`, `fuse.js`, AWS SDK, etc.) are intentionally excluded from this file because this audit is only for missing **repo-local files/routes/pages**.
- Some component findings are alias-path mismatches rather than fully absent code (files exist under nested folders but imports target old root-level paths).
