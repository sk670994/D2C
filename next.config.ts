import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@sparticuz/chromium",
    "playwright-core",
  ],

  outputFileTracingIncludes: {
    "/api/ad-intelligence/search": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
};

export default nextConfig;