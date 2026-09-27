import { describe, expect, it } from "vitest";

import { brandVerdict, decodeAd, hookType, movesFor, pickMoves, summarizeBrand, todayHeadline, type TodayAdRow } from "./insights";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function ad(i: number, over: Partial<TodayAdRow> = {}): TodayAdRow {
  return {
    id: `a${i}`,
    advertiser_name: "Mamaearth",
    creative_type: "video",
    headline: "Up to 35% OFF",
    primary_text: null,
    offer: "Up to 35% OFF",
    first_seen_at: daysAgo(1),
    last_seen_at: daysAgo(0),
    is_currently_active: true,
    ...over,
  };
}

describe("summarizeBrand", () => {
  it("counts launches, formats, the lead hook and the longest live ad", () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => ad(i)),
      ad(100, { headline: "Step to 94% Stronger Hair", offer: null, first_seen_at: daysAgo(117), creative_type: "image" }),
      ad(101, { first_seen_at: daysAgo(20), headline: "Buy 1 Get 1", offer: "Buy 1 Get 1" }),
      ad(102, { first_seen_at: daysAgo(200), last_seen_at: daysAgo(150), is_currently_active: false }),
    ];
    const s = summarizeBrand("619181354927737", rows, NOW);
    expect(s.name).toBe("Mamaearth");
    expect(s.total).toBe(15);
    expect(s.new7).toBe(12);
    expect(s.new30).toBe(13);
    expect(s.formats.image).toBe(1);
    expect(s.leadHook).toEqual({ text: "Up to 35% OFF", count: 12 });
    expect(s.offers[0].type).toBe("percent_off");
    expect(s.longestLive?.hook).toBe("Step to 94% Stronger Hair");
    expect(s.longestLive?.days).toBe(118);
    expect(s.launches14.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it("handles an empty brand", () => {
    const s = summarizeBrand("1", [], NOW);
    expect(s.total).toBe(0);
    expect(brandVerdict(s)).toMatch(/No ads collected/);
    expect(movesFor(s)).toEqual([]);
  });
});

describe("verdict and moves", () => {
  const big = summarizeBrand("1", Array.from({ length: 20 }, (_, i) => ad(i)), NOW);
  const quiet = summarizeBrand("2", [ad(1, { advertiser_name: "Foxtale", first_seen_at: daysAgo(40) })], NOW);

  it("says what the brand is doing, from counted facts", () => {
    expect(brandVerdict(big)).toBe("Pushing hard: 20 new ads this week, most led by “Up to 35% OFF”.");
    expect(brandVerdict(quiet)).toBe("No new ads this week. 1 ad is still live.");
  });

  it("ranks a big push above a quiet rival and caps moves per brand", () => {
    const moves = pickMoves([quiet, big], 3, 1);
    expect(moves.map((m) => m.kind)).toEqual(["big", "quiet"]);
    expect(todayHeadline(moves)).toBe("Mamaearth is pushing hard this week.");
    expect(moves[0].evidence).toHaveLength(3);
  });

  it("adds a staying-power move for a long-running live ad", () => {
    const s = summarizeBrand("3", [ad(1, { headline: "Step to 94% Stronger Hair", first_seen_at: daysAgo(117) })], NOW);
    expect(movesFor(s).map((m) => m.kind)).toEqual(["quiet", "staying"]);
  });

  it("has a helpful headline with no rivals", () => {
    expect(todayHeadline([])).toMatch(/Add rivals/);
  });
});

describe("decoding", () => {
  it("types hooks", () => {
    expect(hookType("Step to 94% Stronger Hair")).toBe("Claim with a number");
    expect(hookType("Buy 1. Get 1 FREE.")).toBe("Offer-led");
    expect(hookType("Tired of hair fall?")).toBe("Question");
    expect(hookType("Loved by 1 lakh customers")).toBe("Social proof");
    expect(hookType(null)).toBeNull();
  });

  it("labels every line with where it came from", () => {
    const lines = decodeAd(
      {
        headline: "Step to 94% Stronger Hair",
        creativeType: "video",
        landingPage: "https://mamaearth.in/products/onion-hair-oil?x=1",
        firstSeen: daysAgo(117),
        lastSeen: daysAgo(0),
        isActive: true,
      },
      NOW,
    );
    const byLabel = Object.fromEntries(lines.map((l) => [l.label, l]));
    expect(byLabel.Hook.provenance).toBe("source");
    expect(byLabel.Offer.value).toMatch(/^None/);
    expect(byLabel.Product.value).toBe("/products/onion-hair-oil");
    expect(byLabel["Likely a winner"]).toEqual({ label: "Likely a winner", value: "Yes: live 118+ days", provenance: "heuristic" });
  });
});
