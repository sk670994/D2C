import type {
  ZwirkPageContext,
  ZwirkRequestContext,
  ZwirkWorkspaceContext
} from "./types";

const EVIDENCE_RULES = [
  "FACT = directly supplied first-party or user data.",
  "OBSERVED = a directly observed AdSpy or market signal.",
  "DERIVED = a calculation or inference from available evidence.",
  "ASSUMPTION = something not directly established by the available data.",
  "RECOMMENDATION = an action proposed from the evidence.",
  "Never represent public competitor observations as the competitor's private performance data.",
  "Running duration is evidence of observed longevity, not proof of profitability.",
  "Derived creative scores are signals, not actual clicks, CTR, impressions, spend, conversions or revenue.",
  "Never invent missing business metrics.",
  "When evidence is insufficient, explicitly state the limitation."
];

export function buildZwirkContext(
  page: ZwirkPageContext,
  workspace: ZwirkWorkspaceContext,
  intent: ZwirkRequestContext["intent"]
): ZwirkRequestContext {
  return {
    page,
    workspace,
    intent,
    evidenceRules: EVIDENCE_RULES
  };
}

export function serializeZwirkContext(
  context: ZwirkRequestContext
): string {
  return JSON.stringify(
    {
      page: context.page,
      intent: context.intent,
      evidenceRules: context.evidenceRules,
      workspace: context.workspace
    },
    null,
    2
  );
}
