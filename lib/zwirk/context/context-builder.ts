import { EVIDENCE_RULES } from "../reasoning/evidence";
import type {
  ZwirkPageContext,
  ZwirkRequestContext,
  ZwirkWorkspaceContext
} from "./types";

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
