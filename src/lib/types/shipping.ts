// src/lib/types/shipping.ts

export type ShippingRate = {
  // required for estimator + API
  carrier: string;
  serviceCode: string;
  serviceName: string;

  // required for summary + UI
  code: string; // stable unique key (carrier:serviceCode)
  name: string; // friendly label (carrier serviceName)
  cost: number; // dollars
  currency: "USD" | "CAD";
  etaDays: number | null;
};
