import { test, expect } from "@playwright/test";

const baseURL =
  process.env.LOCAL_E2E_BASE_URL ?? "http://127.0.0.1:3000";

const publicRoutes = [
  "/",
  "/login",
  "/pricing",
  "/faq",
  "/privacy",
  "/terms",
];

test.describe("Zooptrack public browser smoke tests", () => {
  for (const route of publicRoutes) {
    test(`public page loads: ${route}`, async ({ page }) => {
      const response = await page.goto(`${baseURL}${route}`);

      expect(response, `No response for ${route}`).not.toBeNull();
      expect(response!.status(), `HTTP status for ${route}`).toBe(200);
      await expect(page.locator("body")).toBeVisible();
    });
  }

  for (const route of ["/zooplens", "/today"]) {
    test(`unauthenticated access redirects: ${route}`, async ({ page }) => {
      await page.goto(`${baseURL}${route}`);

      const currentURL = new URL(page.url());

      expect(currentURL.pathname).toBe("/login");
      expect(currentURL.searchParams.get("next")).toBe(route);
      await expect(page.locator("body")).toBeVisible();
    });
  }

  test("version API responds successfully", async ({ request }) => {
    const response = await request.get(`${baseURL}/api/version`);

    expect(response.status()).toBe(200);
  });
});
