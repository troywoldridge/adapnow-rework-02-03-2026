// src/types/domain/order.ts

export type Currency = "USD" | "CAD";

export type OrderStatus = "draft" | "placed" | "paid" | "fulfilled" | "cancelled" | (string & {});
export type PaymentStatus = "paid" | "unpaid" | "pending" | "failed" | "refunded" | (string & {});

export type Order = {
  id: string;

  userId: string;

  status: OrderStatus;

  createdAt?: string | null;
  updatedAt?: string | null;

  orderNumber?: string | null;

  /** char(3) in DB; you mostly use USD/CAD */
  currency?: string | null;

  /** cents */
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;

  placedAt?: string | null;

  /** Stripe / other provider fields */
  provider?: string | null;
  providerId?: string | null;

  customerId?: string | null;

  billingAddressId?: string | null;
  shippingAddressId?: string | null;

  /** existing numeric column (keep as string to avoid float issues) */
  total?: string | null;

  cartId?: string | null;

  paymentStatus?: PaymentStatus | null;

  creditsCents?: number | null;
};
