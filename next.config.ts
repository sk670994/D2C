import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * IMPORTANT:
   * Do NOT externalize playwright-core.
   * Next must bundle it so runtime files such as browsers.json
   * are available inside the Vercel function.
   */
  serverExternalPackages: [
    "@sparticuz/chromium-min",
  ],

  outputFileTracingIncludes: {
    "/api/ad-intelligence/autocomplete": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],

    "/api/ad-intelligence/search": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],

    "/api/ad-intelligence/refresh": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],

    "/api/ad-intelligence/search/status/[jobId]": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],

    "/api/queues/adspy-collection": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],

    "/api/ad-intelligence/test-meta": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],
  },
};

export default nextConfig;
