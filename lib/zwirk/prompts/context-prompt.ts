import { ZWIRK_CORE_PROMPT, ZWIRK_RESPONSE_STYLE } from "../prompts/core";
import { D2C_REASONING_PROMPT } from "../prompts/d2c";
import { AD_ANALYSIS_PROMPT } from "../prompts/ad-analysis";
import { evidenceInstruction } from "../reasoning/evidence";
import type { ZwirkRequestContext, ZwirkWorkspaceContext } from "../context/types";

const VAULT_LABELS: Record<string, string> = {
  brand_name: "Brand name",
  website_url: "Website",
  tone: "Tone",
  audience: "Audience",
  do_not_say: "Do-not-say",
  hero_product: "Hero product",
  main_objection: "Main objection",
  competitor_focus: "Competitor focus",
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Brand Vault as short "Label: value" lines; empty fields are left out. */
export function formatBrandVaultLines(vault: Record<string, unknown> | null | undefined): string {
  if (!vault) return "";
  return Object.entries(VAULT_LABELS)
    .map(([key, label]) => (text(vault[key]) ? `${label}: ${text(vault[key])}` : ""))
    .filter(Boolean)
    .join("\n");
}

/**
 * The workspace context, written once, as labelled blocks. A block with no
 * data is left out entirely (no "No X provided" lines that make the model
 * lecture the user about missing data).
 */
export function renderWorkspaceBlocks(workspace: ZwirkWorkspaceContext): string {
  const blocks: Array<[string, string]> = [
    ["Your dashboard", text(workspace.dashboard)],
    ["Brand Vault", formatBrandVaultLines(workspace.brandVault)],
    ["Competitive radar", text(workspace.competitiveContext)],
    ["ZoopLens intelligence", text(workspace.adSpyContext)],
    ["Rival ads (decoded)", text(workspace.rivalAds)],
    ["History", text(workspace.history)],
    ["Experiments", text(workspace.experiments)],
  ];
  return blocks
    .filter(([, body]) => body.length > 0)
    .map(([title, body]) => `### ${title}\n${body}`)
    .join("\n\n");
}

function renderPage(context: ZwirkRequestContext): string {
  const { page } = context;
  const lines = [`Page: ${page.label} (${page.description})`];
  if (page.entity && page.entity.type !== "none") {
    lines.push(`Selected ${page.entity.type}: ${JSON.stringify(page.entity)}`);
  }
  return lines.join("\n");
}

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

  const workspace = renderWorkspaceBlocks(context.workspace);

  return [
    ZWIRK_CORE_PROMPT.trim(),
    D2C_REASONING_PROMPT.trim(),
    intentPrompt.trim(),
    evidenceInstruction(),
    ZWIRK_RESPONSE_STYLE.trim(),
    "",
    "CURRENT PAGE:",
    renderPage(context),
    `Question type: ${context.intent}`,
    workspace ? `\nCONTEXT (locked; use it, do not invent beyond it):\n${workspace}` : "",
  ]
    .filter((part) => part !== "")
    .join("\n\n");
}
