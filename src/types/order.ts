// src/types/order.ts

export interface ShippingInfo {
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
}

export interface BillingInfo {
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
}

export interface OrderSession {
  id: string;
  productId: string;

  currency: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;

  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  sinaliteOrderId?: string | number | null;

  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}
