import { describe, expect, it } from "vitest";

import { CUT_SHORT_NOTE, finalizeZwirkReply, stripEvidenceTags } from "./reply";

describe("stripEvidenceTags", () => {
  it("removes uppercase evidence labels in every common shape", () => {
    expect(stripEvidenceTags("FACT: CAC is INR 420.")).toBe("CAC is INR 420.");
    expect(stripEvidenceTags("[OBSERVED] Rival runs a 30% off offer.")).toBe("Rival runs a 30% off offer.");
    expect(stripEvidenceTags("- DERIVED: margin is thin")).toBe("- margin is thin");
    expect(stripEvidenceTags("ASSUMPTIONS: AOV near INR 900")).toBe("AOV near INR 900");
    expect(stripEvidenceTags("1. RECOMMENDATION — test a bundle")).toBe("1. test a bundle");
    expect(stripEvidenceTags("**FACT:** CAC is high")).toBe("CAC is high");
    expect(stripEvidenceTags("**OBSERVED**: 3 rivals run UGC")).toBe("3 rivals run UGC");
    expect(stripEvidenceTags("Margin is 22% (FACT) and falling.")).toBe("Margin is 22% and falling.");
  });

  it("keeps ordinary lowercase words", () => {
    const text = "In fact, my assumption is the recommendation holds; it was observed and derived.";
    expect(stripEvidenceTags(text)).toBe(text);
  });
});

describe("finalizeZwirkReply", () => {
  it("cleans role labels and tags", () => {
    const out = finalizeZwirkReply({ content: { parts: [{ text: "ZWIRK: FACT: ROAS is 2.1x.\nUser: next" }] }, finishReason: "STOP" });
    expect(out.reply).toBe("ROAS is 2.1x.");
    expect(out.cutShort).toBe(false);
  });

  it("flags answers cut by the token limit", () => {
    const out = finalizeZwirkReply({ content: { parts: [{ text: "Week 1: test hooks" }] }, finishReason: "MAX_TOKENS" });
    expect(out.reply).toBe(`Week 1: test hooks${CUT_SHORT_NOTE}`);
    expect(out.cutShort).toBe(true);
  });

  it("skips thought parts and handles empty replies", () => {
    expect(finalizeZwirkReply({ content: { parts: [{ text: "thinking", thought: true }, { text: "Answer" }] } }).reply).toBe("Answer");
    expect(finalizeZwirkReply(undefined).reply).toBe("No response generated.");
  });
});
