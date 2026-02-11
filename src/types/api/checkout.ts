// src/types/api/checkout.ts

import type { OrderSession, ShippingInfo, BillingInfo, ShippingTuple } from "@/types/domain/session";

export type OrderSessionGetResponse = {
  session: OrderSession | null;
};

export type OrderSessionCreateRequest = {
  productId: string;
  options?: (number | string)[] | Record<string, unknown>;
  files?: { type: string; url: string }[];
  currency?: string;
  notes?: string;
};

export type OrderSessionCreateResponse = {
  session: OrderSession;
};

export type OrderSessionUpdateRequest = Partial<{
  options: (number | string)[] | Record<string, unknown>;
  files: { type: string; url: string }[];
  shippingInfo: ShippingInfo | null;
  billingInfo: BillingInfo | null;
  selectedShippingRate: ShippingTuple | null;
  notes: string | null;

  // numeric strings
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  currency: string;
}>;

export type OrderSessionUpdateResponse = {
  ok: true;
  session: OrderSession;
};

export type OrderSessionMarkPaidRequest = {
  stripePaymentIntentId: string;
};

export type OrderSessionSetStripeSessionRequest = {
  stripeCheckoutSessionId: string;
};

export type OrderSessionSetStripeSessionResponse = {
  ok: true;
};

export type OrderSessionMarkPaidResponse = {
  ok: true;
};
