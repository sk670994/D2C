import { describe, expect, it } from "vitest";

import { jsonGenerationConfig, thinkingConfigFor } from "./gemini-config";

describe("thinkingConfigFor", () => {
  it("turns thinking off for flash models", () => {
    expect(thinkingConfigFor("gemini-2.5-flash")).toEqual({ thinkingBudget: 0 });
    expect(thinkingConfigFor("models/gemini-2.5-flash-lite")).toEqual({ thinkingBudget: 0 });
  });

  it("uses the smallest budget for pro models", () => {
    expect(thinkingConfigFor("gemini-2.5-pro")).toEqual({ thinkingBudget: 128 });
  });

  it("sends nothing for models without thinking", () => {
    expect(thinkingConfigFor("gemini-2.0-flash")).toBeUndefined();
    expect(thinkingConfigFor("gemini-1.5-pro")).toBeUndefined();
    expect(thinkingConfigFor("")).toBeUndefined();
  });

  it("builds a JSON config with thinking off", () => {
    expect(jsonGenerationConfig("gemini-2.5-flash", { temperature: 0.1, maxOutputTokens: 900 })).toEqual({
      temperature: 0.1,
      maxOutputTokens: 900,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    });
  });
});
