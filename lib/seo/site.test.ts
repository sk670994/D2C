import { describe, expect, it } from "vitest";
import seed from "@/scripts/adspy-seed-brands.json";

import { GUIDES } from "./guides-content";
import { INDUSTRIES, industryOfBrand } from "./industries";
import { allSeoEntries, guideEntries, liveHref, SEO_REDIRECTS, seoPath } from "./site";

const paths = new Set(allSeoEntries.map(seoPath));
const HUBS = ["/brand", "/pricing", "/industries", "/research", "/guides", "/tools"];

describe("SEO pages", () => {
  it("redirects point to live pages and never to themselves", () => {
    for (const [from, to] of SEO_REDIRECTS) {
      expect(paths.has(to)).toBe(true);
      expect(paths.has(from)).toBe(false);
    }
  });

  it("every internal link resolves to a live page", () => {
    const links = [...allSeoEntries.flatMap((e) => e.related), ...Object.values(GUIDES).flatMap((g) => g.next)].map(liveHref);
    for (const href of links) expect(paths.has(href) || HUBS.includes(href)).toBe(true);
  });

  it("every guide has written content", () => {
    for (const g of guideEntries) expect((GUIDES[g.slug]?.sections.length ?? 0) > 2).toBe(true);
  });

  it("industries only use brands we collect, each in one category", () => {
    const brands = new Set((seed as { brands: string[] }).brands);
    const used = INDUSTRIES.flatMap((i) => i.brands);
    for (const b of used) expect(brands.has(b)).toBe(true);
    expect(new Set(used).size).toBe(used.length);
    expect(industryOfBrand("DOT & KEY")?.slug).toBe("skincare");
  });
});
