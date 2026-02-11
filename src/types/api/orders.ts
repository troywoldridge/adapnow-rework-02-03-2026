// src/types/api/orders.ts

import type { Order } from "@/types/domain/order";

export type OrdersListResponse = {
  orders: Order[];
};

export type OrderGetResponse = {
  order: Order | null;
};

export type OrderCreateRequest = {
  cartId?: string;
};

export type OrderCreateResponse = {
  orderId: string;
};

export type OrderMarkPaidRequest = {
  orderId: string;
  provider?: string;        // e.g. "stripe"
  providerId?: string;      // e.g. paymentIntentId
  paymentStatus?: string;   // "paid"
};

export type OrderMarkPaidResponse = {
  ok: true;
};
