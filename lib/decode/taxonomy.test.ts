import { describe, expect, it } from "vitest";

import { decodePrompt, normalizeDecoded, parseModelJson, topPatterns, valueLabel } from "./taxonomy";

describe("normalizeDecoded", () => {
  it("keeps only values from the taxonomy", () => {
    const d = normalizeDecoded({
      hookType: "Claim with number",
      angle: "results",
      persona: "aliens",
      visualStyle: "UGC-selfie",
      language: "Hinglish",
      offerPresent: false,
      productFocus: "  Onion hair oil  ",
      summary: "A creator shows hair results.",
    });
    expect(d.hookType).toBe("claim_with_number");
    expect(d.angle).toBe("results");
    expect(d.persona).toBeNull();
    expect(d.visualStyle).toBe("ugc_selfie");
    expect(d.language).toBe("hinglish");
    expect(d.offerPresent).toBe(false);
    expect(d.productFocus).toBe("Onion hair oil");
    expect(d.emotion).toBeNull();
  });

  it("survives garbage", () => {
    const d = normalizeDecoded("nope");
    expect(d.hookType).toBeNull();
    expect(d.offerPresent).toBeNull();
    expect(d.summary).toBeNull();
  });
});

describe("parseModelJson", () => {
  it("reads JSON inside code fences", () => {
    expect(parseModelJson('```json\n{"angle":"results"}\n```')).toEqual({ angle: "results" });
    expect(parseModelJson("no json here")).toBeNull();
    expect(parseModelJson("{broken")).toBeNull();
  });
});

describe("patterns", () => {
  it("counts the most common values with shares", () => {
    const a = normalizeDecoded({ angle: "results", language: "hindi" });
    const b = normalizeDecoded({ angle: "results", language: "english" });
    const c = normalizeDecoded({ angle: "price_value" });
    const top = topPatterns([a, b, c], 1);
    const angle = top.find((p) => p.key === "angle");
    expect(angle).toEqual({ key: "angle", value: "results", label: "Results", count: 2, share: 67 });
    expect(topPatterns([], 1)).toEqual([]);
  });

  it("labels values for people", () => {
    expect(valueLabel("ugc_selfie")).toBe("UGC selfie");
    expect(valueLabel("young_professionals")).toBe("Young professionals");
  });

  it("puts the taxonomy and the ad into the prompt", () => {
    const p = decodePrompt({ advertiser: "Mamaearth", headline: "Up to 35% OFF", copy: null, cta: "Shop now", format: "video" });
    expect(p.includes("hookType: one of offer")).toBe(true);
    expect(p.includes("Headline: Up to 35% OFF")).toBe(true);
  });
});
