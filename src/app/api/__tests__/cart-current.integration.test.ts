// Integration test: GET /api/cart/current returns envelope
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: () => undefined,
    })
  ),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      carts: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
  },
}));

describe("GET /api/cart/current", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok envelope with empty cart when no sid cookie", async () => {
    const { GET } = await import("@/app/api/cart/current/route");
    const req = new Request("http://localhost/api/cart/current");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cart).toBeNull();
    expect(Array.isArray(body.lines)).toBe(true);
    expect(body.lines).toHaveLength(0);
    expect(body.currency).toBe("USD");
    expect(body.subtotalCents).toBe(0);
  });
});
