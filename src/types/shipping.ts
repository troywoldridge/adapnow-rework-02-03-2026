// src/types/shipping.ts

/**
 * Shipping + Sinalite order payload types used by your app.
 * These are "DTO-ish" types: safe to use in both client and server code.
 *
 * IMPORTANT:
 * - Do NOT re-export Id/Currency/Country here to avoid collisions.
 * - Those canonical primitives should live in ./storefront (or another single canonical module).
 */

import type { Id, Currency, Country } from "./storefront";

/** Used in Sinalite order and shipping estimate payloads */
export interface SinaliteOrderItem {
  productId: Id;
  options: (number | string)[];
  files?: { type: string; url: string }[];
  extra?: string;
}

export interface SinaliteOrderShippingInfo {
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

  /** Optional: sometimes set by UI */
  ShipMethod?: string;
}

export interface SinaliteOrderBillingInfo {
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

export interface SinaliteShippingEstimateRequest {
  items: SinaliteOrderItem[];
  shippingInfo: SinaliteOrderShippingInfo;
  billingInfo: SinaliteOrderBillingInfo;
  notes?: string;
}

/**
 * Sinalite often returns shipping estimate rows like:
 * [carrier, method, price, days]
 * You also have code that uses {carrier, method, price, days}
 */
export interface SinaliteShippingMethod {
  carrier: string;
  service: string; // method/service name
  price: number;
  available: boolean;
  days?: number | null;
}

/** Useful normalized shape for UI */
export interface ShippingRate {
  carrier: string;
  method: string;
  price: number;
  currency: Currency;
  days: number | null;
  country?: Country; // optional convenience when you have it
}
