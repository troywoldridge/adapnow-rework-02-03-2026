// Integration test: POST /api/cart/sinalite/price validation (mocked Sinalite)
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetchSinaliteProductOptions = vi.fn();
const mockPriceSinaliteProduct = vi.fn();
const mockValidateOnePerGroup = vi.fn();

vi.mock("@/lib/sinalite", () => ({
  fetchSinaliteProductOptions: (...args: unknown[]) =>
    mockFetchSinaliteProductOptions(...args),
  priceSinaliteProduct: (...args: unknown[]) =>
    mockPriceSinaliteProduct(...args),
  validateOnePerGroup: (...args: unknown[]) =>
    mockValidateOnePerGroup(...args),
}));

describe("POST /api/cart/sinalite/price", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOnePerGroup.mockReturnValue({
      ok: true,
      normalizedOptionIds: [1, 2],
      groupsUsed: ["size", "material"],
    });
    mockPriceSinaliteProduct.mockResolvedValue({
      unitPrice: 9.99,
      pricingMeta: null,
    });
    mockFetchSinaliteProductOptions.mockResolvedValue([]);
  });

  it("returns 400 when optionIds missing", async () => {
    const { POST } = await import("@/app/api/cart/sinalite/price/route");
    const req = new Request("http://localhost/api/cart/sinalite/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: 123 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/optionIds/i);
    expect(mockPriceSinaliteProduct).not.toHaveBeenCalled();
  });

  it("returns 400 when productId invalid", async () => {
    const { POST } = await import("@/app/api/cart/sinalite/price/route");
    const req = new Request("http://localhost/api/cart/sinalite/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "invalid", optionIds: [1, 2] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns 200 with unitPrice when valid", async () => {
    const { POST } = await import("@/app/api/cart/sinalite/price/route");
    const req = new Request("http://localhost/api/cart/sinalite/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: 123, optionIds: [1, 2] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.unitPrice).toBe(9.99);
    expect(mockPriceSinaliteProduct).toHaveBeenCalled();
  });
});
