// src/types/domain/cart.ts

export type Currency = "USD" | "CAD";
export type StoreCountry = "US" | "CA";

export type SelectedShipping = {
  carrier: string;
  method: string;

  /** Total shipping cost in *dollars* (your DB stores cents elsewhere, but this JSON is UI-oriented) */
  cost: number;

  /** Business days */
  days: number | null;

  currency: Currency;

  /** Destination */
  country: StoreCountry;
  state: string;
  zip: string;
};

export type CartStatus = "open" | "pending" | "closed" | (string & {});

export type Cart = {
  id: string;
  sid: string;
  status: CartStatus;
  userId?: string | null;

  currency: Currency;

  /** persisted selection from /order/shippingEstimate */
  selectedShipping?: SelectedShipping | null;

  createdAt: string;
  updatedAt: string;
};

export type CartLine = {
  id: string;
  cartId: string;

  productId: number;
  quantity: number;

  /** cents */
  unitPriceCents: number;

  /** cents; optional precomputed */
  lineTotalCents?: number | null;

  optionIds: number[];

  /** JSONB from your schema; keep flexible */
  artwork?: unknown;

  currency: Currency;

  createdAt: string;
  updatedAt: string;
};
