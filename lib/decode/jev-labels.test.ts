import { describe, expect, it } from "vitest";

import { estimateCostUsd } from "@/lib/ai/ledger";
import { jevQuestions, labelsFromJev, mergeDecodes, needsVisualRead, rubricMatchesTaxonomy } from "./jev-labels";
import { normalizeDecoded } from "./taxonomy";

describe("Jev questions", () => {
  it("offer every taxonomy value, with a rubric", () => {
    expect(rubricMatchesTaxonomy()).toBe(true);
    const q = jevQuestions();
    expect(q.hookType.type).toBe("choice");
    expect(q.offerPresent.type).toBe("noul");
    expect(q.bigPush.type).toBe("noul");
  });
});

describe("labelsFromJev", () => {
  it("keeps confident labels and drops unsure ones", () => {
    const labels = labelsFromJev({
      hookType: { choice: "offer", confidence: 0.91 },
      angle: { choice: "results", probabilities: { results: 0.41, price_value: 0.39 } },
      persona: { choice: "women", confidence: 0.77 },
      language: { choice: "hinglish", confidence: 0.88 },
      emotion: { choice: "not_a_value", confidence: 0.99 },
      offerPresent: { noul: 0.93 },
      bigPush: { noul: 0.2 },
    });
    expect(labels.elements.hookType).toBe("offer");
    expect(labels.elements.angle).toBeNull(); // 0.41 < 0.6
    expect(labels.elements.persona).toBe("women");
    expect(labels.elements.language).toBe("hinglish");
    expect(labels.elements.emotion).toBeNull(); // outside the taxonomy
    expect(labels.elements.offerPresent).toBe(true);
    expect(labels.elements.visualStyle).toBeNull();
    expect(labels.bigPush).toBe(0.2);
    expect(labels.confidence.hookType).toBe(0.91);
  });

  it("leaves an unsure offer as unknown", () => {
    expect(labelsFromJev({ offerPresent: { noul: 0.5 } }).elements.offerPresent).toBeNull();
    expect(labelsFromJev({ offerPresent: { noul: 0.1 } }).elements.offerPresent).toBe(false);
  });
});

describe("mergeDecodes", () => {
  it("visuals from Gemini, text from Jev only when Jev is very sure", () => {
    const gemini = normalizeDecoded({ hookType: "question", angle: "results", visualStyle: "ugc_selfie", summary: "A UGC ad." });
    const jev = labelsFromJev({ hookType: { choice: "offer", confidence: 0.95 }, angle: { choice: "price_value", confidence: 0.7 }, persona: { choice: "women", confidence: 0.9 } });
    const merged = mergeDecodes(gemini, jev);
    expect(merged.hookType).toBe("offer"); // Jev 0.95 wins
    expect(merged.angle).toBe("results"); // Jev 0.7 < 0.8: Gemini kept
    expect(merged.persona).toBe("women"); // Gemini had nothing
    expect(merged.visualStyle).toBe("ugc_selfie");
    expect(merged.summary).toBe("A UGC ad.");
    expect(mergeDecodes(gemini, null)).toEqual(gemini);
  });
});

describe("needsVisualRead", () => {
  const base = { watched: false, isActive: true, runningDays: 2, hasMedia: true, bigPush: 0.1 };
  it("reads watched, long-running and launch ads only", () => {
    expect(needsVisualRead(base)).toBe(false);
    expect(needsVisualRead({ ...base, watched: true })).toBe(true);
    expect(needsVisualRead({ ...base, runningDays: 9 })).toBe(true);
    expect(needsVisualRead({ ...base, bigPush: 0.85 })).toBe(true);
    expect(needsVisualRead({ ...base, watched: true, hasMedia: false })).toBe(false);
    expect(needsVisualRead({ ...base, watched: true, isActive: false })).toBe(false);
  });
});

describe("ledger cost", () => {
  it("prices Jev input only and Gemini both ways", () => {
    expect(estimateCostUsd({ provider: "jev", inputTokens: 1_000_000, outputTokens: 500 })).toBe(0.042);
    expect(estimateCostUsd({ provider: "gemini", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(2.8);
  });
});
