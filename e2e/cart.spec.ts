import { test, expect } from "@playwright/test";

test.describe("Cart", () => {
  test("GET /api/cart/current returns cart envelope", async ({ request }) => {
    const res = await request.get("/api/cart/current");
    expect(res.ok()).toBe(true);

    const json = await res.json();
    expect(json).toHaveProperty("ok", true);
    expect(json).toHaveProperty("lines");
    expect(Array.isArray(json.lines)).toBe(true);
    expect(json).toHaveProperty("currency");
  });

  test("home page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible({ timeout: 5000 });
  });
});
