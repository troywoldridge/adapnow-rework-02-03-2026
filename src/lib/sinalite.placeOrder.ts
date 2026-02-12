// src/lib/sinalite.placeOrder.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import "server-only";

import { getEnv } from "@/lib/env";
import { getSinaliteAccessToken } from "@/lib/getSinaliteAccessToken";

function getBase(): string {
  return getEnv().SINALITE_BASE_URL || "https://api.sinaliteuppy.com";
}

export type PlaceSinaliteOrderResult = {
  orderId: number;
  message: string;
  status: string;
};

export class SinaliteOrderError extends Error {
  status: number;
  body?: string;

  constructor(message: string, status: number, body?: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function withBearer(token: string): string {
  const t = String(token ?? "").trim();
  if (!t) return "";
  return t.toLowerCase().startsWith("bearer ") ? t : `Bearer ${t}`;
}

export async function placeSinaliteOrder(orderData: any): Promise<PlaceSinaliteOrderResult> {
  const token = await getSinaliteAccessToken();
  const auth = withBearer(token);
  if (!auth) {
    throw new Error("Missing Sinalite access token (getSinaliteAccessToken returned empty).");
  }

  const url = `${getBase()}/order/new`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: auth,
    },
    body: JSON.stringify(orderData ?? {}),
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new SinaliteOrderError(
      `Sinalite order failed: ${res.status} ${res.statusText} @ ${url}`,
      res.status,
      txt
    );
  }

  const json = (await res.json().catch(() => null)) as any;
  if (!json || typeof json !== "object") {
    throw new SinaliteOrderError("Sinalite order returned non-JSON response.", 502);
  }

  // Be tolerant of slight shape variations.
  const orderId = Number(json.orderId ?? json.order_id ?? json.id);
  const message = String(json.message ?? "ok");
  const status = String(json.status ?? "success");

  if (!Number.isFinite(orderId)) {
    throw new SinaliteOrderError(
      `Sinalite order response missing orderId. Got: ${JSON.stringify(json).slice(0, 500)}`,
      502
    );
  }

  return { orderId, message, status };
}
