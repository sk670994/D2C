/**
 * Thinking settings for Gemini calls. Pure; unit tested in gemini-config.test.ts.
 *
 * Gemini 2.5+ "thinks" before answering and those thought tokens count against
 * maxOutputTokens. With a small budget the visible answer (or JSON) gets cut
 * off. Flash models can switch thinking off (budget 0); Pro models cannot, so
 * they get the smallest allowed budget (128). Older models (1.x / 2.0) do not
 * accept thinkingConfig at all, so nothing is sent for them.
 */
export function thinkingConfigFor(model: string | null | undefined): { thinkingBudget: number } | undefined {
  const name = String(model ?? "").toLowerCase().replace(/^models\//, "");
  if (!name) return undefined;
  if (/gemini-(1\.|2\.0)/.test(name)) return undefined;
  return { thinkingBudget: /pro/.test(name) ? 128 : 0 };
}

/** generationConfig fields shared by JSON-only calls (decoder, insights). */
export function jsonGenerationConfig(model: string, options: { temperature: number; maxOutputTokens: number }) {
  const thinking = thinkingConfigFor(model);
  return {
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
    responseMimeType: "application/json",
    ...(thinking ? { thinkingConfig: thinking } : {}),
  };
}
