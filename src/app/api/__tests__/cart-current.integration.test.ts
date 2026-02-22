import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/cart/current/route";

type CurrentCartResponse = {
  ok: boolean;
  cart: null | { id: string; sid: string; status: string; currency: "USD" | "CAD" };
  lines: Array<{
    id: string;
    productId: number;
    quantity: number;
  }>;
  subtotalCents: number;
  currency: "USD" | "CAD";
};

describe("/api/cart/current", () => {
  it("returns an empty envelope when no sid cookie exists", async () => {
    // ✅ Use standard Request (Cloudflare-compatible)
    const req = new Request("http://localhost/api/cart/current", {
      method: "GET",
      headers: {
        "x-request-id": "test_rid_1",
      },
    });

    const res = await GET(req as any);
    expect(res.status).toBe(200);

    // ✅ Response.json() is typed as unknown in some envs
    const body = (await res.json()) as CurrentCartResponse;

    expect(body.ok).toBe(true);
    expect(body.cart).toBe(null);
    expect(Array.isArray(body.lines)).toBe(true);
    expect(body.subtotalCents).toBe(0);
  });

  it("returns an envelope when sid cookie exists", async () => {
    const req = new Request("http://localhost/api/cart/current", {
      method: "GET",
      headers: {
        "x-request-id": "test_rid_2",
        cookie: "sid=test_sid_123",
      },
    });

    const res = await GET(req as any);
    expect(res.status).toBe(200);

    const body = (await res.json()) as CurrentCartResponse;

    expect(body.ok).toBe(true);
    // Cart may exist or not depending on fixture DB; just assert shape stability:
    expect(body).toHaveProperty("lines");
    expect(body).toHaveProperty("subtotalCents");
  });
});
