import type { MetadataRoute } from "next";

const SITE = "https://www.zooptrack.co.in";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in app screens and APIs have nothing for search engines.
      disallow: ["/api/", "/auth/", "/dashboard", "/adspy", "/zwirk", "/records", "/brand-vault", "/demo"],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
