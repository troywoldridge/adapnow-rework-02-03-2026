// src/app/api/__tests__/sinalite-price.integration.test.ts
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/sinalite", () => {
  return {
    fetchSinaliteProductOptions: vi.fn(async () => {
      // route expects an array (not { productOptions })
      return [
        { id: 1, group: "qty", name: "100" },
        { id: 2, group: "size", name: "4x6" },
      ] as any[];
    }),
    validateOnePerGroup: vi.fn(() => {
      // route expects validate result with normalizedOptionIds and ok=true
      return {
        ok: true,
        normalizedOptionIds: [1, 2],
        groupsUsed: { qty: 1, size: 2 },
        requiredGroups: ["qty", "size"],
      };
    }),
    priceSinaliteProduct: vi.fn(async () => {
      // route returns this under `priced`
      return { price: "12.34" };
    }),
  };
});

describe("Sinalite price route (integration)", () => {
  it("returns ok=true when upstream responds", async () => {
    const mod: any = await import("@/app/api/cart/sinalite/price/route");
    expect(typeof mod.POST).toBe("function");

    const req = new NextRequest("http://localhost/api/cart/sinalite/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: 123, // MUST be a number (your failure was 'productId must be a number')
        optionIds: [1, 2],
        store: "US",
      }),
    } as any);

    const res = await mod.POST(req);
    expect(res).toBeTruthy();
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.productId).toBe(123);
    expect(data.store).toBe("US");
    expect(data.normalizedOptionIds).toEqual([1, 2]);
    expect(data.priced).toBeTruthy();
  });

  it("returns ok=false when upstream fails", async () => {
    const sinalite: any = await import("@/lib/sinalite");
    sinalite.priceSinaliteProduct.mockImplementationOnce(async () => {
      throw new Error("Upstream failed");
    });

    const mod: any = await import("@/app/api/cart/sinalite/price/route");
    expect(typeof mod.POST).toBe("function");

    const req = new NextRequest("http://localhost/api/cart/sinalite/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: 123,
        optionIds: [1, 2],
        store: "US",
      }),
    } as any);

    const res = await mod.POST(req);
    expect(res).toBeTruthy();

    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.requestId).toBeTruthy();
  });
});
