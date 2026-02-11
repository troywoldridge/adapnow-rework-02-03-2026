// src/types/domain/session.ts

export type Currency = "USD" | "CAD" | (string & {});
export type ShippingTuple = [carrier: string, service: string, price: number, days: number];

export type UploadedFileRef = { type: string; url: string };

export type ShippingInfo = {
  ShipFName: string;
  ShipLName: string;
  ShipEmail: string;

  ShipAddr: string;
  ShipAddr2?: string;
  ShipCity: string;

  ShipState: string;
  ShipZip: string;
  ShipCountry: string;
  ShipPhone: string;
};

export type BillingInfo = {
  BillFName: string;
  BillLName: string;
  BillEmail: string;

  BillAddr: string;
  BillAddr2?: string;
  BillCity: string;

  BillState: string;
  BillZip: string;
  BillCountry: string;
  BillPhone: string;
};

export type OrderSession = {
  id: string;

  userId?: string | null;

  /** varchar(64) in DB; stored as string */
  productId: string;

  /** jsonb; can be a flat id list or a group->id map */
  options: (number | string)[] | Record<string, unknown>;

  files: UploadedFileRef[];

  /** jsonb in DB (currently Record<string, any>); keep as typed object in app */
  shippingInfo?: ShippingInfo | null;
  billingInfo?: BillingInfo | null;

  trackingUrl?: string | null;

  currency: Currency;

  /** numeric in DB; treat as string at rest; parse to number in UI when needed */
  subtotal: string;
  tax: string;
  discount: string;
  total: string;

  /** [carrier, method, price, days] */
  selectedShippingRate?: ShippingTuple | null;

  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;

  sinaliteOrderId?: string | null;

  notes?: string | null;

  createdAt?: string | null;
  updatedAt?: string | null;
};
