import type { MetadataRoute } from "next";

const SITE = "https://www.zooptrack.co.in";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/dashboard",
        "/adspy",
        "/zwirk",
        "/records",
        "/brand-vault",
        "/demo",
        "/today",
        "/login",
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
