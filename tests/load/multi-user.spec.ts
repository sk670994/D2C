import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { runUser, type UserResult } from "./scenarios";

const configuredEmails = (
  process.env.LOAD_TEST_USERS ?? ""
)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);

const hasLoadTestCredentials = Boolean(
  process.env.LOAD_TEST_PASSWORD?.trim() &&
    configuredEmails.length > 0
);

const configuredBaseURL =
  process.env.LOAD_TEST_BASE_URL?.trim() ?? "";

function isValidHttpURL(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function isLoopbackURL(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    ) && [
      "localhost",
      "127.0.0.1",
      "::1",
      "[::1]",
    ].includes(url.hostname);
  } catch {
    return false;
  }
}

test.describe(
  "Zooptrack zero-credit multi-user simulation",
  () => {
    test(
  "configured independent users work at the same time",
  async ({ browser }) => {
    test.setTimeout(10 * 60 * 1000);
        // --------------------------------------------------------
        // PREFLIGHT: skip safely when configuration is missing.
        // This also lets Playwright discover tests without
        // importing users.ts and triggering its required() calls.
        // --------------------------------------------------------

        test.skip(
          !hasLoadTestCredentials,
          "Configure LOAD_TEST_USERS and LOAD_TEST_PASSWORD with dedicated test accounts before running this test."
        );

        test.skip(
          !isValidHttpURL(configuredBaseURL),
          "Set LOAD_TEST_BASE_URL to a valid HTTP(S) test-server URL."
        );

        test.skip(
          !isLoopbackURL(configuredBaseURL) &&
            process.env.LOAD_TEST_ALLOW_REMOTE !== "1",
          "Remote targets are refused by default. Use an isolated staging environment and explicitly set LOAD_TEST_ALLOW_REMOTE=1 only after verifying its safety."
        );

        // Load the module only after preflight succeeds.
        const { USERS } = await import("./users");

        const countSetting =
          process.env.LOAD_TEST_COUNT?.trim();

        let requestedUsers = USERS.length;

        if (countSetting) {
          const parsedCount = Number(countSetting);

          if (
            !Number.isInteger(parsedCount) ||
            parsedCount < 1
          ) {
            throw new Error(
              "LOAD_TEST_COUNT must be a positive integer."
            );
          }

          requestedUsers = parsedCount;
        }

        const activeUsers = USERS.slice(
          0,
          Math.min(requestedUsers, USERS.length)
        );

        expect(activeUsers.length).toBeGreaterThan(0);

        const startedAt = Date.now();

        // Shared across simulated users so any direct browser
        // attempt to contact a paid provider is recorded.
        const blockedProviderRequests: string[] = [];

        const executions = activeUsers.map(
          async (user, index): Promise<UserResult> => {
            const context = await browser.newContext();
            const page = await context.newPage();

            try {
              // ==================================================
              // FIRST: REGISTER THE PROVIDER-BLOCKING CATCH-ALL
              // ==================================================
              //
              // Playwright considers matching routes in reverse
              // registration order. The specific API mocks below
              // are registered later and therefore take priority.
              //
              // This protects against direct browser requests to
              // the listed provider hosts. It does NOT, by itself,
              // block requests made server-side by the application.

              await page.route(
                "**/*",
                async (route) => {
                  const url = new URL(
                    route.request().url()
                  );

                  const host =
                    url.hostname.toLowerCase();

                  const isScrapeCreators =
                    host === "scrapecreators.com" ||
                    host.endsWith(
                      ".scrapecreators.com"
                    );

                  const isSearchApi =
                    host === "searchapi.io" ||
                    host.endsWith(".searchapi.io");

                  if (
                    isScrapeCreators ||
                    isSearchApi
                  ) {
                    // Store only origin and path; avoid recording
                    // query strings that could contain sensitive data.
                    blockedProviderRequests.push(
                      `${route.request().method()} ` +
                        `${url.origin}${url.pathname}`
                    );

                    await route.abort("blockedbyclient");
                    return;
                  }

                  await route.continue();
                }
              );

              // ==================================================
              // SPECIFIC MOCKS: REGISTER AFTER THE CATCH-ALL
              // ==================================================

              // Never allow the UI to invoke real ad collection.
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

              // Never allow a browser-side queue-drain request.
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

              // Mock autocomplete and nested autocomplete endpoints.
              // This intentionally avoids calling the real endpoint
              // that could invoke live Meta page discovery.
              await page.route(
                "**/api/ad-intelligence/autocomplete**",
                async (route) => {
                  const requestUrl = new URL(
                    route.request().url()
                  );

                  const query =
                    requestUrl.searchParams
                      .get("q")
                      ?.trim() ?? "";

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

                  const filtered = query
                    ? brands.filter((brand) =>
                        brand
                          .toLowerCase()
                          .includes(query.toLowerCase())
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

              // Mock collection status so the UI does not poll
              // a real job or depend on a real worker.
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

              // ================================================
              // EXECUTE THE EXISTING USER SCENARIO
              // ================================================

              // Stagger startup slightly so every browser does
              // not attempt login at exactly the same moment.
              await new Promise<void>((resolve) => {
                setTimeout(resolve, index * 350);
              });

              return await runUser(page, user);
            } finally {
              await context.close();
            }
          }
        );

        // All simulated users run concurrently.
        const results: UserResult[] =
          await Promise.all(executions);

        const totalMs = Date.now() - startedAt;

        const successful = results.filter(
          (result) => result.success
        );

        const failed = results.filter(
          (result) => !result.success
        );

        const report = {
          test: "zooptrack-mocked-provider-multi-user",
          timestamp: new Date().toISOString(),

          requestedUsers: activeUsers.length,

          successfulUsers: successful.length,
          failedUsers: failed.length,

          totalDurationMs: totalMs,

          averageUserDurationMs: results.length
            ? Math.round(
                results.reduce(
                  (sum, result) =>
                    sum + result.durationMs,
                  0
                ) / results.length
              )
            : 0,

          // Record whether an unexpected direct browser request
          // attempted to reach a paid provider.
          blockedProviderRequests,

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
          JSON.stringify(report, null, 2)
        );

        console.log("");
        console.log(
          "======================================="
        );
        console.log(
          " ZOOPTRACK MULTI-USER BROWSER TEST"
        );
        console.log(
          "======================================="
        );
        console.log(
          `Users:                 ${activeUsers.length}`
        );
        console.log(
          `Successful:            ${successful.length}`
        );
        console.log(
          `Failed:                ${failed.length}`
        );
        console.log(
          `Duration:              ${(totalMs / 1000).toFixed(1)}s`
        );
        console.log(
          "Refresh API:           mocked"
        );
        console.log(
          "Autocomplete API:      mocked"
        );
        console.log(
          `Blocked provider requests: ${blockedProviderRequests.length}`
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
              `scenario=${result.scenario} ` +
              `duration=${result.durationMs}ms`
          );

          if (result.errors.length > 0) {
            for (const error of result.errors) {
              console.log(`  ERROR: ${error}`);
            }
          }
        }

        // Fail if any direct browser request tried to reach one
        // of the blocked paid-provider domains.
        expect(
          blockedProviderRequests,
          "Unexpected direct browser request to a paid scraper provider."
        ).toEqual([]);

        expect(
          failed.length,
          failed.length
            ? "Some simulated users failed. See tests/results/multi-user-report.json."
            : undefined
        ).toBe(0);
          }
    );
  }
);