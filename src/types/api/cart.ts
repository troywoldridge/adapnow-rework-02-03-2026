// src/types/api/cart.ts

import type { Cart, CartLine, SelectedShipping } from "@/types/domain/cart";

export type CartGetResponse = {
  cart: Cart | null;
  lines: CartLine[];
};

export type CartEnsureLineRequest = {
  productId: number;
  quantity?: number;
  optionIds?: number[];
};

export type CartEnsureLineResponse = {
  cartId: string;
  lineId: string;
};

export type CartRepriceRequest = {
  lineId: string;
};

export type CartRepriceResponse = {
  lineId: string;
  unitPriceCents: number;
  lineTotalCents: number;
  currency: "USD" | "CAD";
};

export type CartChooseShippingRequest = SelectedShipping;

export type CartChooseShippingResponse = {
  ok: true;
  selectedShipping: SelectedShipping | null;
};

export type CartClearShippingResponse = {
  ok: true;
};
