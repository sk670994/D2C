import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./load",

  timeout: 90_000,

  fullyParallel: false,

  workers: 1,

  reporter: [
    ["list"],
    ["html", {
      outputFolder: "results/playwright-report",
      open: "never"
    }],
    ["json", {
      outputFile: "results/playwright-results.json"
    }]
  ],

  use: {
    baseURL: process.env.LOAD_TEST_BASE_URL,

    headless: true,

    channel: "chrome",

    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",

    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
