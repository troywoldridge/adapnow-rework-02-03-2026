import { test, expect } from "@playwright/test";

test.describe("Account", () => {
  test("unauthenticated visit to /account redirects to sign-in", async ({ page }) => {
    await page.goto("/account");

    // Clerk redirects to sign-in (path typically /sign-in)
    await expect(page).toHaveURL(/sign-in|sign_up/, { timeout: 10000 });
  });

  test("sign-in page loads", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
  });
});
