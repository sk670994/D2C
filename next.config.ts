import type { NextConfig } from "next";

const browserRuntimeFiles = [
  "./node_modules/playwright-core/**/*",
  "./node_modules/@sparticuz/chromium-min/**/*",
];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@sparticuz/chromium-min",
    "playwright-core",
  ],

  outputFileTracingIncludes: {
    "/api/ad-intelligence/autocomplete": browserRuntimeFiles,
    "/api/ad-intelligence/search": browserRuntimeFiles,
    "/api/ad-intelligence/refresh": browserRuntimeFiles,
    "/api/queues/adspy-collection": browserRuntimeFiles,
  },
};

export default nextConfig;
