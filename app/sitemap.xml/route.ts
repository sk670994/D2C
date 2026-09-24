import { brandSlug } from "@/lib/ad-intelligence/brand-slug";
import seed from "@/scripts/adspy-seed-brands.json";

// /sitemap.xml for search engines (the human sitemap lives at /sitemap).
export const revalidate = 86400;

const SITE = "https://www.zooptrack.co.in";

const PAGES: Array<[path: string, priority: number, freq: string]> = [
  ["/", 1, "weekly"],
  ["/brand", 0.9, "daily"],
  ["/pricing", 0.8, "monthly"],
  ["/decision-loop", 0.6, "monthly"],
  ["/faq", 0.6, "monthly"],
  ["/login", 0.5, "yearly"],
  ["/contact", 0.4, "yearly"],
  ["/sitemap", 0.3, "monthly"],
  ["/privacy", 0.2, "yearly"],
  ["/terms", 0.2, "yearly"],
  ["/cookies", 0.2, "yearly"],
];

function entry(path: string, priority: number, freq: string, lastmod: string) {
  return `<url><loc>${SITE}${path}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${priority.toFixed(1)}</priority></url>`;
}

export function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const slugs = [...new Set((seed as { brands: string[] }).brands.map((b) => brandSlug(b)).filter(Boolean))];
  const urls = [
    ...PAGES.map(([p, pr, f]) => entry(p, pr, f, today)),
    ...slugs.map((s) => entry(`/brand/${s}`, 0.7, "daily", today)),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
