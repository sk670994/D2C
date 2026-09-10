import type { ActionItem } from "@/lib/llm/decision-engine";

export type RecommendationDecision = "SCALE" | "HOLD" | "FIX" | "TEST";

export type StructuredRecommendation = {
  id: string;
  decision: RecommendationDecision;
  confidence: "high" | "medium" | "low";
  title: string;
  action: string;
  evidence: string[];
  expectedImpact: string;
  assumptions: string[];
  risks: string[];
  createdAt: string;
  expiresAt: string;
};

function decisionFor(action: ActionItem): RecommendationDecision {
  if (action.category === "increase-spend") return "SCALE";
  if (action.category === "test-new-angle" || action.category === "change-creative") return "TEST";
  if (action.category === "pause" || action.category === "reduce-spend") return "HOLD";
  return "FIX";
}

export function recommendationFromAction(
  action: ActionItem,
  context: { evidence?: string[]; assumptions?: string[]; risks?: string[] } = {},
): StructuredRecommendation {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + 7);

  return {
    id: `REC-${createdAt.getTime().toString().slice(-8)}`,
    decision: decisionFor(action),
    confidence: context.evidence && context.evidence.length >= 2 ? "high" : "medium",
    title: action.title,
    action: action.description,
    evidence: context.evidence ?? [],
    expectedImpact: action.expectedImpact,
    assumptions: context.assumptions ?? ["Current inputs and observed period remain representative."],
    risks: context.risks ?? ["Reassess after the next measurement period."],
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
