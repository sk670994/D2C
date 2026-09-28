import { describe, expect, it } from "vitest";

import { changeTitle, detectChanges, diffVersions, wordOverlap, type VersionRow } from "./changes";

const v = (over: Partial<VersionRow>): VersionRow => ({
  creative_id: "ad1",
  primary_text: "Deep clean your pores with our foam scrub. Dermat tested.",
  headline: "Pore Cleansing Foam Scrub",
  call_to_action: "Shop now",
  landing_page_url: "https://mamaearth.in/scrub?utm_source=fb&x=1",
  offer: "20% off",
  product_price: 299,
  currency: "INR",
  first_observed_at: "2026-09-20T00:00:00Z",
  ...over,
});

describe("diffVersions", () => {
  it("finds offer and price changes", () => {
    const out = diffVersions(v({}), v({ offer: "Buy 2 Get 1", product_price: 349, first_observed_at: "2026-09-27T00:00:00Z" }));
    expect(out.map((c) => c.kind).join(",")).toBe("offer,price");
    expect(out[0].before).toBe("20% off");
    expect(out[0].after).toBe("Buy 2 Get 1");
    expect(out[1].after).toBe("₹349");
  });

  it("ignores noise: filled-in fields, whitespace, tracking params", () => {
    expect(diffVersions(v({ offer: null }), v({ offer: "20% off" }))).toEqual([]);
    expect(diffVersions(v({}), v({ primary_text: "Deep clean your pores  with our foam scrub!  Dermat tested" }))).toEqual([]);
    expect(diffVersions(v({}), v({ landing_page_url: "https://www.mamaearth.in/scrub/?utm_source=ig" }))).toEqual([]);
  });

  it("reports a real rewrite and a new landing page", () => {
    const rewrite = diffVersions(v({}), v({ primary_text: "Winter sale: your skin deserves a festive glow this Diwali." }));
    expect(rewrite.map((c) => c.kind).join(",")).toBe("copy");
    const landing = diffVersions(v({}), v({ landing_page_url: "https://mamaearth.in/diwali-sale" }));
    expect(landing[0].kind).toBe("landing");
  });
});

describe("detectChanges", () => {
  it("keeps recent changes, most important first", () => {
    const rows = [
      v({ first_observed_at: "2026-09-01T00:00:00Z" }),
      v({ call_to_action: "Learn more", first_observed_at: "2026-09-10T00:00:00Z" }),
      v({ call_to_action: "Learn more", offer: "Free gift", first_observed_at: "2026-09-26T00:00:00Z" }),
      v({ creative_id: "ad2", first_observed_at: "2026-09-26T00:00:00Z" }),
    ];
    const out = detectChanges(rows, Date.parse("2026-09-21T00:00:00Z"));
    expect(out.length).toBe(1); // the CTA change is older than the window; ad2 has one version
    expect(out[0].kind).toBe("offer");
    expect(changeTitle(out[0])).toBe("Changed an offer: “20% off” → “Free gift”.");
  });

  it("measures word overlap", () => {
    expect(wordOverlap("a big sale today", "a big sale today")).toBe(1);
    expect(wordOverlap("", "")).toBe(1);
    expect(wordOverlap("buy now", "shop later") < 0.2).toBe(true);
  });
});
