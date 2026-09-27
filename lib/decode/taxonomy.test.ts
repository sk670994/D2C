import { describe, expect, it } from "vitest";

import { cleanEnvValue, decodePrompt, isKeyError, isRetryableError, normalizeDecoded, parseModelJson, shouldSkipDecode, topPatterns, valueLabel } from "./taxonomy";

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

describe("decode housekeeping", () => {
  it("strips quotes pasted around env values", () => {
    expect(cleanEnvValue('"AIzaKey"')).toBe("AIzaKey");
    expect(cleanEnvValue(" 'gemini-2.5-flash' ")).toBe("gemini-2.5-flash");
    expect(cleanEnvValue("plain")).toBe("plain");
    expect(cleanEnvValue(undefined)).toBe("");
    expect(cleanEnvValue('"half')).toBe('"half');
  });

  it("retries failed decodes after the cool-down, never done ones", () => {
    const now = Date.parse("2026-09-27T12:00:00Z");
    expect(shouldSkipDecode({ status: "done", decoded_at: "2026-01-01T00:00:00Z" }, now)).toBe(true);
    expect(shouldSkipDecode({ status: "failed", decoded_at: "2026-09-27T10:00:00Z" }, now)).toBe(true);
    expect(shouldSkipDecode({ status: "failed", decoded_at: "2026-09-27T05:00:00Z" }, now)).toBe(false);
    expect(shouldSkipDecode({ status: "failed", decoded_at: null }, now)).toBe(false);
  });

  it("tells key problems from ad problems", () => {
    expect(isKeyError('Gemini 400: {"error":{"message":"API key not valid. Please pass a valid API key."}}')).toBe(true);
    expect(isKeyError("Gemini 404: models/gemini-9 is not found for API version v1beta")).toBe(true);
    expect(isKeyError("Model did not return JSON.")).toBe(false);
    expect(isRetryableError("The operation was aborted due to timeout")).toBe(true);
    expect(isRetryableError("Gemini 503: overloaded")).toBe(true);
    expect(isRetryableError("Gemini 400: bad image")).toBe(false);
  });
});
