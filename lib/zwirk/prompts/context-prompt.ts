import { ZWIRK_CORE_PROMPT } from "../prompts/core";
import { D2C_REASONING_PROMPT } from "../prompts/d2c";
import { AD_ANALYSIS_PROMPT } from "../prompts/ad-analysis";
import { evidenceInstruction } from "../reasoning/evidence";
import type { ZwirkRequestContext } from "../context/types";

export function buildSpecializedZwirkPrompt(
  context: ZwirkRequestContext
): string {
  const intentPrompt =
    context.intent === "ad_analysis" ||
    context.intent === "ad_success_analysis" ||
    context.intent === "ad_failure_analysis" ||
    context.intent === "creative_analysis"
      ? AD_ANALYSIS_PROMPT
      : "";

  return [
    ZWIRK_CORE_PROMPT,
    D2C_REASONING_PROMPT,
    intentPrompt,
    evidenceInstruction(),
    "",
    "CURRENT PAGE:",
    JSON.stringify(context.page, null, 2),
    "",
    "CURRENT WORKSPACE CONTEXT:",
    JSON.stringify(context.workspace, null, 2),
    "",
    `CURRENT INTENT: ${context.intent}`
  ]
    .filter(Boolean)
    .join("\n");
}

