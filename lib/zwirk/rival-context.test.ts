import { describe, expect, it } from "vitest";

import { buildRivalContext, type RivalCreative } from "./rival-context";

const now = Date.parse("2026-10-19T12:00:00Z");

describe("buildRivalContext", () => {
  it("returns nothing without a watchlist", () => {
    expect(buildRivalContext([], [], new Map(), now)).toBe("");
  });

  it("names the rivals even before any ad is decoded", () => {
    expect(buildRivalContext([{ advertiser_id: "1", advertiser_name: "Mamaearth" }], [], new Map(), now)).toBe("Watched rivals: Mamaearth");
  });

  it("writes one compact line per decoded ad", () => {
    const creatives = new Map<string, RivalCreative>([
      ["c1", { id: "c1", headline: "Flat 30% off  on onion shampoo", creative_type: "VIDEO", first_seen_at: "2026-09-19T12:00:00Z", is_currently_active: true }],
    ]);
    const text = buildRivalContext(
      [{ advertiser_id: "1", advertiser_name: "Mamaearth" }],
      [{ creative_id: "c1", advertiser_id: "1", decoded_at: null, elements: { hookType: "offer", language: "hinglish", offerPresent: true, summary: "Discount on shampoo for women", _bigPush: 1 } }],
      creatives,
      now,
    );
    expect(text).toContain("Watched rivals: Mamaearth");
    expect(text).toContain("- Mamaearth · video · running 30d · hook: Offer · lang: Hinglish · has offer — Discount on shampoo for women | headline: \"Flat 30% off on onion shampoo\"");
    expect(text).toContain("hook Offer (100%)");
  });

  it("stays under the size cap", () => {
    const decodes = Array.from({ length: 50 }, (_, i) => ({
      creative_id: `c${i}`,
      advertiser_id: "1",
      decoded_at: null,
      elements: { hookType: "offer", summary: "x".repeat(170) },
    }));
    const text = buildRivalContext([{ advertiser_id: "1", advertiser_name: "Brand" }], decodes, new Map(), now, 1000);
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text.split("\n").filter((l) => l.startsWith("- ")).length).toBeGreaterThan(0);
  });
});
