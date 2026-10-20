/**
 * Clean-up of a ZWIRK model reply before it reaches the user. Pure; unit
 * tested in reply.test.ts.
 */

export const CUT_SHORT_NOTE = "\n\n_(Answer cut short — ask me to continue.)_";

/**
 * Remove leftover evidence labels ("FACT:", "[OBSERVED]", "ASSUMPTIONS: ").
 * Uppercase only, so ordinary words like "fact" or "assumption" survive.
 */
export function stripEvidenceTags(text: string): string {
  return text
    // Wrapped forms first so no empty "****" or "()" is left behind.
    .replace(/\*\*\[?(FACT|OBSERVED|DERIVED|ASSUMPTION|RECOMMENDATION)S?\]?:?\*\*:?\s*/g, "")
    .replace(/\((FACT|OBSERVED|DERIVED|ASSUMPTION|RECOMMENDATION)S?\)\s*/g, "")
    .replace(/\[?\b(FACT|OBSERVED|DERIVED|ASSUMPTION|RECOMMENDATION)S?\b\]?:?\s*/g, "")
    .replace(/^([ \t]*(?:[-*]|\d+[.)])[ \t]+)[-–—·|][ \t]*/gm, "$1")
    .replace(/[ \t]+$/gm, "");
}

export type GeminiCandidate = {
  content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  finishReason?: string;
};

/** Text of the first candidate (thought parts skipped), cleaned for display. */
export function finalizeZwirkReply(candidate: GeminiCandidate | undefined): { reply: string; raw: string; cutShort: boolean } {
  const parts = candidate?.content?.parts ?? [];
  const raw = parts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  const cutShort = candidate?.finishReason === "MAX_TOKENS";
  if (!raw) {
    return { reply: cutShort ? `No response generated.${CUT_SHORT_NOTE}` : "No response generated.", raw, cutShort };
  }
  let reply = stripEvidenceTags(
    raw
      .replace(/^ZWIRK:\s*/i, "")
      .replace(/\nUser:.*$/s, "")
  ).trim();
  if (!reply) reply = "No response generated.";
  if (cutShort) reply += CUT_SHORT_NOTE;
  return { reply, raw, cutShort };
}
