import type { ZwirkEvidence, ZwirkEvidenceType } from "../context/types";

export function evidence(
  type: ZwirkEvidenceType,
  statement: string,
  source: ZwirkEvidence["source"]
): ZwirkEvidence {
  return {
    type,
    statement,
    source
  };
}

/** The one copy of ZWIRK's evidence rules (used by the prompt and the context object). */
export const EVIDENCE_RULES = [
  "Classify evidence internally. Never print labels like FACT, OBSERVED, DERIVED, ASSUMPTION. In plain words say 'from your dashboard', 'from rival ads', or 'my assumption'.",
  "Never invent the user's revenue, profit, CAC, ROAS, spend, CTR, impressions, clicks, conversions or orders, and never claim a rival's revenue, spend or profitability.",
  "Rival ads come from the public Meta Ad Library: never present them as private performance data.",
  "How long an ad has run shows longevity, not profit. Scores are signals, not real clicks, CTR, spend or sales.",
  "Do not upgrade a guess into a fact: 'running 94 days' is an observation; 'so it is profitable' is not supported; 'it may be worth studying' is fair."
];

export function evidenceInstruction(): string {
  return ["EVIDENCE:", ...EVIDENCE_RULES.map((rule) => `- ${rule}`)].join("\n");
}
