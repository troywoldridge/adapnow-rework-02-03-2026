// src/types/api/shipping.ts

import type {
  SinaliteOrderItem,
  SinaliteOrderShippingInfo,
  SinaliteOrderBillingInfo,
  ShippingRate,
} from "@/types/shipping";

export type ShippingEstimateRequest = {
  items: SinaliteOrderItem[];
  shippingInfo: SinaliteOrderShippingInfo;
  billingInfo?: SinaliteOrderBillingInfo;
  notes?: string;
};

export type ShippingEstimateResponse = {
  rates: ShippingRate[];
};
