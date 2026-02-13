// Unit tests for pricing module
import { describe, it, expect } from "vitest";
import { applyTieredMarkup } from "@/lib/pricing";

describe("applyTieredMarkup", () => {
  it("returns unitSellCents and lineSellCents for US store", async () => {
    const result = await applyTieredMarkup({
      store: "US",
      quantity: 1,
      unitCostCents: 100,
    });

    expect(result).toHaveProperty("unitSellCents");
    expect(result).toHaveProperty("lineSellCents");
    expect(typeof result.unitSellCents).toBe("number");
    expect(typeof result.lineSellCents).toBe("number");
    expect(result.unitSellCents).toBeGreaterThanOrEqual(100);
  });

  it("applies tiered markup for higher quantity", async () => {
    const qty1 = await applyTieredMarkup({
      store: "US",
      quantity: 1,
      lineCostCents: 1000,
    });

    const qty10 = await applyTieredMarkup({
      store: "US",
      quantity: 10,
      lineCostCents: 10000,
    });

    const unit1 = qty1.unitSellCents;
    const unit10 = qty10.unitSellCents;
    expect(unit10).toBeLessThanOrEqual(unit1 * 1.1); // bulk can have lower unit price
  });

  it("handles CA store", async () => {
    const result = await applyTieredMarkup({
      store: "CA",
      quantity: 5,
      unitCostCents: 50,
    });

    expect(result.lineSellCents).toBe(result.unitSellCents * 5);
  });
});
