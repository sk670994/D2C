import { beforeAll, describe, expect, it, vi } from "vitest";

// `server-only` is enforced by Next.js at runtime; unit tests exercise the
// pure detector and do not need the Next.js server-only guard.
vi.mock("server-only", () => ({}));

let detectLanguages: typeof import("./language").detectLanguages;

beforeAll(async () => {
  ({ detectLanguages } = await import("./language"));
});

function codes(text: string): string[] {
  return detectLanguages(text).map((language) => language.code);
}

describe("AdSpy language detection", () => {
  it("recognizes realistic English ad copy even when it uses brand/product terms", () => {
    const text =
      "TATA AIG Expect Complete Claims with TATA AIG Medicare Premier & Check the Benefits to Protect Yourself and your Family. " +
      "Avail 0% GST On Premium. Easy & Quick Claim Settlement. Great Protection with Medicare Premier plan. " +
      "Tata AIG Health Insurance helps protect your family with a plan that is easy to understand.";

    expect(codes(text)).toContain("en");
  });

  it("recognizes long-form English marketing copy", () => {
    const text =
      "India's 8 Hour Chair for Everyday Comfort. Meet the chair built for all-day comfort and productivity. " +
      "Adjustable lumbar support helps improve posture, while the breathable mesh back provides comfort for long hours. " +
      "Discover the new collection and shop today.";

    expect(codes(text)).toContain("en");
  });

  it("detects Devanagari script as a heuristic Hindi signal", () => {
    expect(codes("अपनी त्वचा की देखभाल करें और प्राकृतिक चमक पाएं। आज ही खरीदें।")).toContain("hi");
  });

  it("detects natural Romanized Hindi/Hinglish when multiple signals are present", () => {
    const text =
      "Honestly, pehle mujhe bhi lagta tha bracelet sirf fashion hota hai. Focus better tha. " +
      "Decisions clearer the. Ab apni style ko upgrade karo aur dekho kya change hota hai.";

    expect(codes(text)).toContain("hinglish");
  });

  it("keeps mixed Devanagari and English copy multi-labeled", () => {
    const text =
      "आपकी skin care routine के लिए a better daily formula. Your skin deserves gentle care, visible results, and a routine that feels good every day.";
    const detected = codes(text);

    expect(detected).toContain("hi");
    expect(detected).toContain("en");
    expect(detected).toContain("hinglish");
  });

  it("does not classify short brand/product-only strings", () => {
    expect(codes("TATA AIG Medicare Premier")).toEqual([]);
    expect(codes("Nike Air Max 90")).toEqual([]);
    expect(codes("   ")).toEqual([]);
  });

  it("does not infer Hinglish from one Hindi UI word in English copy", () => {
    const text = "सक्रिय Everything your skin needs. Shah Rukh Khan x Foxtale Let your glow through.";
    expect(codes(text)).not.toContain("hinglish");
  });

  it("does not label short English product copy as French", () => {
    expect(
      codes("India's Best Selling Ceramide Moisturiser Long-lasting Hydration Barrier Repair + Deep Nourishment"),
    ).not.toContain("fr");
  });
  it("emits bounded heuristic confidence values", () => {
    const detected = detectLanguages(
      "Your skin deserves gentle daily care with a simple routine. Discover the new collection, learn how it works, and shop today for great results.",
    );

    expect(detected.length).toBeGreaterThan(0);
    for (const language of detected) {
      expect(language.source).toBe("heuristic");
      expect(language.confidence).toBeGreaterThanOrEqual(0);
      expect(language.confidence).toBeLessThanOrEqual(1);
    }
  });
});
