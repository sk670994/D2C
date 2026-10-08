import type { NextConfig } from "next";

import { SEO_REDIRECTS } from "./lib/seo/redirects";

const nextConfig: NextConfig = {
  // Merged SEO pages: old URLs point permanently to the stronger page.
  async redirects() {
    return SEO_REDIRECTS.map(([source, destination]) => ({ source, destination, permanent: true }));
  },

  serverExternalPackages: [
    "playwright-core",
    "@sparticuz/chromium-min",
  ],

  outputFileTracingIncludes: {
    "/api/queues/adspy-collection": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],
  },
};

export default nextConfig;
