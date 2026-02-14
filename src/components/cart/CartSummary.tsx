"use client";

import { useMemo } from "react";
import ProceedToCheckout from "@/components/cart/ProceedToCheckout";
import CartShippingEstimator, { type ShippingRate as EstimatorRate } from "@/components/CartShippingEstimator";

type MiniLine = {
  productId: number;
  optionIds: number[];
  quantity?: number;
  [k: string]: any;
};

type StoreCode = "US" | "CA";

type Props = {
  currency: "USD" | "CAD";
  subtotal: number;
  lines: MiniLine[];
  store: StoreCode;

  /**
   * Selected shipping from server/cart (best to keep this shape stable in parent).
   * NOTE: We align this to the estimator's ShippingRate to avoid brittle casting.
   */
  selectedShipping: EstimatorRate | null;

  /**
   * Called when the user chooses a rate (or clears it).
   * Parent can store it in state OR re-read from cart after estimator persists it.
   */
  onChangeShipping: (rate: EstimatorRate | null) => void;

  /**
   * Optional: initial address used by the estimator inputs.
   * If you already have these in the cart/customer profile, pass them in.
   */
  initialState?: string;
  initialZip?: string;
};

function money(n: number, currency: "USD" | "CAD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(n) || 0);
}

export default function CartSummary({
  currency,
  subtotal,
  lines,
  store,
  selectedShipping,
  onChangeShipping,
  initialState = "",
  initialZip = "",
}: Props) {
  const shippingCost = useMemo(() => {
    const v = selectedShipping?.amount ?? 0;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  }, [selectedShipping]);

  const total = useMemo(() => subtotal + shippingCost, [subtotal, shippingCost]);

  // Adapter: if parent still passes productId as string/number etc., coerce safely here.
  const estimatorLines = useMemo(() => {
    const raw = Array.isArray(lines) ? lines : [];
    return raw
      .map((l) => ({
        productId: Number(l.productId),
        optionIds: Array.isArray(l.optionIds) ? l.optionIds.map((x) => Number(x)).filter(Number.isFinite) : [],
        quantity: Number.isFinite(Number(l.quantity)) ? Math.max(1, Math.floor(Number(l.quantity))) : 1,
      }))
      .filter((l) => Number.isFinite(l.productId) && l.productId > 0 && l.optionIds.length > 0);
  }, [lines]);

  return (
    <div className="order-summary rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Title */}
      <h3 className="mb-2 text-base font-extrabold tracking-tight">Order Summary</h3>

      {/* Subtotal */}
      <div className="flex items-center justify-between py-1 text-sm">
        <span className="text-slate-500">Subtotal</span>
        <span className="font-medium">{money(subtotal, currency)}</span>
      </div>

      {/* Shipping */}
      <div className="flex items-center justify-between py-1 text-sm">
        <span className="text-slate-500">Shipping</span>
        <span className="font-medium">{money(shippingCost, currency)}</span>
      </div>

      {/* Total */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
        <span className="text-sm font-semibold">Total</span>
        <span className="text-lg font-extrabold">{money(total, currency)}</span>
      </div>

      {/* Estimator */}
      <div className="mt-4">
        <h4 className="mb-2 text-sm font-semibold">Estimate shipping</h4>

        {/* Keep these classes so the tiny CSS below can arrange the inner fields. */}
        <div className="estimator estimator--compact rounded-xl border border-gray-200 bg-white p-4">
          <CartShippingEstimator
            initialCountry={store}
            initialState={initialState}
            initialZip={initialZip}
            lines={estimatorLines}
            currency={currency}
          />
        </div>
      </div>

      {/* Checkout CTA */}
      <div className="mt-4">
        <ProceedToCheckout className="h-10 w-full rounded-lg border border-transparent bg-blue-700 font-bold text-white transition hover:bg-blue-800">
          Continue to checkout
        </ProceedToCheckout>
      </div>

      {/* ——— Minimal scoped CSS only for the estimator grid ——— */}
      <style jsx global>{`
        .cart2__right .order-summary .estimator,
        .cart2__right .order-summary .estimator :where(form,.estimator__inputs,.estimator__rates){
          width:100%!important; max-width:none!important; margin:0!important;
        }
        .estimator.estimator--compact :where(form,.estimator__inputs){
          display:grid!important;
          grid-template-columns:minmax(150px,1fr) 88px 140px!important;
          gap:12px!important; align-items:end!important;
        }
        @media (max-width:640px){
          .estimator.estimator--compact :where(form,.estimator__inputs){ grid-template-columns:1fr 1fr!important; }
          .estimator.estimator--compact :where(form) > :nth-child(3){ grid-column:1 / -1!important; }
        }
        .estimator.estimator--compact :where(select,input){
          height:36px!important; width:100%!important; box-sizing:border-box!important;
          padding:0 10px!important; border:1px solid #e5e7eb!important; border-radius:8px!important;
          background:#fff!important; font-size:.95rem!important; line-height:1!important;
        }
        .estimator.estimator--compact :where(select,input):focus{
          outline:2px solid transparent!important;
          box-shadow:0 0 0 3px rgba(0,98,255,.2)!important;
          border-color:rgba(0,98,255,.5)!important;
        }
        .estimator.estimator--compact :where(button,[type="submit"],.shipping-estimator__button){
          grid-column:1 / -1!important; height:40px!important; padding:0 16px!important;
          border-radius:10px!important; font-weight:700!important;
          background:#1e40af!important; color:#fff!important; border:1px solid transparent!important;
        }
        .estimator.estimator--compact :where(button,[type="submit"],.shipping-estimator__button):hover{ filter:brightness(.98); }
        .estimator.estimator--compact .estimator__rates{ list-style:none; margin:14px 0 0; padding:0; }
        .estimator.estimator--compact .estimator__rate{
          display:grid!important; grid-template-columns:28px 1fr auto; grid-template-rows:auto auto;
          grid-template-areas:"radio name price" "radio eta price"; column-gap:14px; row-gap:6px;
          width:100%; padding:14px; border-radius:10px; background:#f8fafc; border:1px solid #eef2f7;
        }
        .estimator.estimator--compact .estimator__rate + .estimator__rate{ margin-top:8px; }
        .estimator.estimator--compact .estimator__rate :where(input[type="radio"]){
          grid-area:radio!important; justify-self:center; align-self:start; transform:scale(.82); accent-color:#1e40af;
        }
        .estimator.estimator--compact .estimator__rate-name{ grid-area:name!important; white-space:normal!important; }
        .estimator.estimator--compact .estimator__rate-name > *{ display:inline; vertical-align:middle; }
        .estimator.estimator--compact .estimator__rate-name > * + *{ margin-left:8px; }
        .estimator.estimator--compact .estimator__rate-eta{ grid-area:eta!important; margin:0; font-size:.9rem; color:#667085; }
        .estimator.estimator--compact .estimator__rate-right{
          grid-area:price!important; justify-self:end; align-self:center; min-width:96px; white-space:nowrap; font-weight:700;
        }
        .order-summary{ padding:16px!important; }
        .order-summary .reviewpg__sumKV{ padding:8px 0!important; }
        .order-summary .estimator{ margin-top:12px!important; }
        .cart2__rowRight .link-dim{
          display:inline-flex; align-items:center; justify-content:center; height:36px; padding:0 12px;
          border-radius:10px; font-weight:700; background:#1e40af; color:#fff; border:1px solid transparent; text-decoration:none;
        }
        .cart2__rowRight .link-dim:hover{ filter:brightness(.98); }
        .cart2__rowRight .link-dim:focus-visible{
          outline:2px solid transparent; box-shadow:0 0 0 3px rgba(30,64,175,.25);
        }
      `}</style>
    </div>
  );
}
