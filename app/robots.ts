import type { MetadataRoute } from "next";

const SITE = "https://www.zooptrack.co.in";

/** Signed-in app and API: never crawled. */
const PRIVATE = ["/api/", "/auth/", "/dashboard", "/adspy", "/zwirk", "/records", "/brand-vault", "/demo", "/today", "/login"];

/** AI answer engines (GEO): welcome on public pages, so Zooptrack can be cited in AI answers. */
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_BOTS, allow: ["/", "/llms.txt"], disallow: PRIVATE },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
