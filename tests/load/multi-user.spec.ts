import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { USERS } from "./users";
import { runUser, type UserResult } from "./scenarios";

const requestedUsers = Number(
  process.env.LOAD_TEST_COUNT || USERS.length
);

const activeUsers = USERS.slice(
  0,
  Math.max(1, Math.min(requestedUsers, USERS.length))
);

test.describe(
  "Zooptrack zero-credit multi-user simulation",
  () => {
    test(
      `${activeUsers.length} independent users work at the same time`,
      async ({ browser }) => {
        expect(activeUsers.length).toBeGreaterThan(0);

        const startedAt = Date.now();

        const executions = activeUsers.map(
          async (user, index) => {
            // Different users = different browser contexts.
            const context = await browser.newContext();

            const page = await context.newPage();

            // ====================================================
            // ABSOLUTE TEST PROTECTION
            // ====================================================

            // Never allow the UI to call the real collection endpoint.
            await page.route(
              "**/api/ad-intelligence/refresh",
              async (route) => {
                const jobId =
                  `loadtest-${user.id}-${Date.now()}`;

                await route.fulfill({
                  status: 200,
                  contentType: "application/json",
                  body: JSON.stringify({
                    success: true,
                    outcome: "test_mocked",
                    message:
                      "Collection mocked by zero-credit load test.",
                    job: {
                      id: jobId,
                      status: "queued",
                      discoveredAds: 0,
                      normalizedAds: 0,
                      persistedAds: 0,
                    },
                  }),
                });
              }
            );

            // Never allow a browser-side drain request.
            await page.route(
              "**/api/adspy/drain**",
              async (route) => {
                await route.fulfill({
                  status: 202,
                  contentType: "application/json",
                  body: JSON.stringify({
                    success: true,
                    mocked: true,
                  }),
                });
              }
            );

            // Autocomplete is mocked so a test environment with
            // live enrichment enabled cannot call a paid provider.
            await page.route(
              "**/api/ad-intelligence/autocomplete**",
              async (route) => {
                const requestUrl =
                  new URL(route.request().url());

                const q =
                  requestUrl.searchParams
                    .get("q")
                    ?.trim() || "";

                const brands = [
                  "Nike",
                  "Adidas",
                  "boAt",
                  "Mamaearth",
                  "Minimalist",
                  "Noise",
                  "Nykaa",
                  "Myntra",
                ];

                const filtered = q
                  ? brands.filter((brand) =>
                      brand
                        .toLowerCase()
                        .includes(q.toLowerCase())
                    )
                  : brands;

                await route.fulfill({
                  status: 200,
                  contentType: "application/json",
                  body: JSON.stringify({
                    success: true,
                    advertisers: filtered
                      .slice(0, 5)
                      .map((name, i) => ({
                        pageId: String(
                          100000000000000 + i
                        ),
                        name,
                        country: "IN",
                      })),
                  }),
                });
              }
            );

            // Fake job status so "Collecting..." does not
            // continue polling forever.
            await page.route(
              "**/api/ad-intelligence/search/status/**",
              async (route) => {
                await route.fulfill({
                  status: 200,
                  contentType: "application/json",
                  body: JSON.stringify({
                    success: true,
                    job: {
                      id: "loadtest-job",
                      status: "completed",
                      discoveredAds: 30,
                      normalizedAds: 30,
                      persistedAds: 30,
                      errorMessage: null,
                    },
                  }),
                });
              }
            );

            // Browser itself must never directly hit paid providers.
            await page.route(
              "**/*",
              async (route) => {
                const url =
                  route.request().url();

                if (
                  url.includes(
                    "api.scrapecreators.com"
                  ) ||
                  url.includes(
                    "searchapi.io"
                  )
                ) {
                  throw new Error(
                    `BLOCKED PAID PROVIDER REQUEST: ${url}`
                  );
                }

                await route.continue();
              }
            );

            try {
              // Stagger startup slightly so every browser
              // doesn't hit login on the exact same millisecond.
              await new Promise((resolve) =>
                setTimeout(resolve, index * 350)
              );

              return await runUser(page, user);
            } finally {
              await context.close();
            }
          }
        );

        // ALL users execute concurrently.
        const results = await Promise.all(
          executions
        );

        const totalMs =
          Date.now() - startedAt;

        const successful =
          results.filter((r) => r.success);

        const failed =
          results.filter((r) => !r.success);

        const report = {
          test: "zooptrack-zero-credit-multi-user",
          timestamp:
            new Date().toISOString(),

          requestedUsers:
            activeUsers.length,

          successfulUsers:
            successful.length,

          failedUsers:
            failed.length,

          totalDurationMs:
            totalMs,

          averageUserDurationMs:
            results.length
              ? Math.round(
                  results.reduce(
                    (sum, r) =>
                      sum + r.durationMs,
                    0
                  ) / results.length
                )
              : 0,

          results,
        };

        fs.mkdirSync(
          path.resolve("tests/results"),
          { recursive: true }
        );

        fs.writeFileSync(
          path.resolve(
            "tests/results/multi-user-report.json"
          ),
          JSON.stringify(
            report,
            null,
            2
          )
        );

        console.log("");
        console.log(
          "======================================="
        );
        console.log(
          " ZOOPTRACK ZERO-CREDIT MULTI-USER TEST"
        );
        console.log(
          "======================================="
        );
        console.log(
          `Users:                ${activeUsers.length}`
        );
        console.log(
          `Successful:           ${successful.length}`
        );
        console.log(
          `Failed:               ${failed.length}`
        );
        console.log(
          `Duration:             ${(totalMs / 1000).toFixed(1)}s`
        );
        console.log(
          "Paid scraper calls:   BLOCKED"
        );
        console.log(
          "SearchApi calls:      BLOCKED"
        );
        console.log(
          "ScrapeCreators calls: BLOCKED"
        );
        console.log(
          "Report: tests/results/multi-user-report.json"
        );
        console.log(
          "======================================="
        );
        console.log("");

        for (const result of results) {
          console.log(
            `${result.success ? "PASS" : "FAIL"} ` +
            `User ${result.userId} ` +
            `${result.email} ` +
            `scenario=${result.scenario} ` +
            `duration=${result.durationMs}ms`
          );

          if (result.errors.length) {
            for (const error of result.errors) {
              console.log(
                `  ERROR: ${error}`
              );
            }
          }
        }

        expect(
          failed.length,
          failed.length
            ? `Some users failed. See tests/results/multi-user-report.json`
            : undefined
        ).toBe(0);
      },
      10 * 60 * 1000
    );
  }
);
