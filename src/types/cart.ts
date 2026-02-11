// src/types/cart.ts

export type Currency = "USD" | "CAD";

export interface CartLineArtwork {
  side: string;
  url: string;
}

export interface CartLine {
  id: string;
  productId: number;
  quantity: number;

  optionIds?: number[];

  artwork?: CartLineArtwork[];

  priceCents?: number;
  currency?: Currency;

  createdAt?: string;
  updatedAt?: string;
}

export interface ShippingChoice {
  country: "US" | "CA";
  state: string;
  zip: string;
  carrier: string;
  method: string;
  cost: number;
  days: number | null;
  currency: Currency;
}
