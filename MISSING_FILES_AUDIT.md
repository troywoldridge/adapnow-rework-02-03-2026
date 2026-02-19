# Missing Files Audit (Next.js App Router)

This report lists **repo-local missing references** found by scanning imports and route/page path usage under `src/`.

## Missing lib files

- `src/lib/sendEmail.ts` (code imports `@/lib/sendEmail`; existing implementation is at `src/lib/email/sendEmail.ts`)
- `src/lib/sinalite.pricing.ts` (imports use legacy root path `@/lib/sinalite.pricing`; current implementation lives under `src/lib/sinalite/sinalite.pricing.ts`)
- `src/lib/sinalite.pricing-server.ts` (imports use legacy root path `@/lib/sinalite.pricing-server`; current implementation lives under `src/lib/sinalite/sinalite.pricing-server.ts`)
- `src/lib/sinalite.pricing-local.ts` (imported in product configurator; no repo-local file present)

## Missing components

- `src/components/CartSummary.tsx` (imports use `@/components/CartSummary`; existing component is at `src/components/cart/CartSummary.tsx`)
- `src/components/CartLineItem.tsx` (imports use `@/components/CartLineItem`; existing component is at `src/components/cart/CartLineItem.tsx`)
- `src/components/CartShippingEstimator.tsx` (imports use `@/components/CartShippingEstimator`; existing component is at `src/components/cart/CartShippingEstimator.tsx`)
- `src/components/CartArtworkThumb.tsx` (imports use `@/components/CartArtworkThumb`; existing component is at `src/components/cart/CartArtworkThumb.tsx`)
- `src/components/CartCreditsRow.tsx` (imports use `@/components/CartCreditsRow`; existing component is at `src/components/cart/CartCreditsRow.tsx`)
- `src/components/AddAnotherSideButton.tsx` (imports use `@/components/AddAnotherSideButton`; existing component is at `src/components/artwork/AddAnotherSideButton.tsx`)
- `src/components/ChangeShippingButton.tsx` (imports use `@/components/ChangeShippingButton`; existing component is at `src/components/buttons/ChangeShippingButton.tsx`)
- `src/components/ArtworkUploadBoxes.tsx` (imports use `@/components/ArtworkUploadBoxes`; existing component is at `src/components/artwork/ArtworkUploadBoxes.tsx`)
- `src/components/CheckoutPaymentElement.tsx` (imports use `@/components/CheckoutPaymentElement`; existing component is at `src/components/stripe/CheckoutPaymentElement.tsx`)
- `src/components/cart/ShippingEstimator.tsx` (re-exported from `src/components/cart/index.ts` as `./ShippingEstimator` but file is absent)

## Missing routes

Detected as code references to `/api/**` without matching `src/app/**/route.ts`:

- `src/app/api/cart/estimate-shipping/route.ts`
- `src/app/api/custom-orders/route.ts`
- `src/app/api/session/ensure/route.ts`
- `src/app/api/sinalite/price/route.ts`
- `src/app/api/uploads/presign/route.ts`

## Missing pages

Detected as route usages (`href`, redirects, or router navigation) without matching `src/app/**/page.tsx`:

- `src/app/account/orders/page.tsx`
- `src/app/account/security/manage/page.tsx`
- `src/app/contact/form/page.tsx`
- `src/app/products/page.tsx`
- `src/app/quote/page.tsx`
- `src/app/rewards/page.tsx`
- `src/app/sample-kits/page.tsx`
- `src/app/search/page.tsx`
- `src/app/shipping-info/page.tsx`
- `src/app/support/chat/page.tsx`
- `src/app/support/ticket/page.tsx`

## Missing app-level component

- `src/app/HomeShellClient.tsx` (imported by `src/app/page.tsx` as `./HomeShellClient`)

## Notes

- This audit focuses on **repo-local** missing files only.
- Several findings are alias-path mismatches (files exist in nested folders, but imports still target old top-level locations).
