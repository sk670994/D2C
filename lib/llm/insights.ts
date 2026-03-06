import type { CalculatedReport, InsightPayload } from "@/lib/types/domain";

type OllamaGenerateResponse = {
  response?: string;
};

type OllamaInsights = {
  summary?: string;
  priorityFixes?: string[];
};

function fallbackInsights(report: CalculatedReport): InsightPayload {
  const fixes: string[] = [];

  if (report.adMetrics.blendedRoas < 3) fixes.push("Improve ROAS to at least 3x before scaling budgets.");
  if (report.unitEconomics.contributionMarginPct < 0.3) fixes.push("Increase contribution margin above 30% by fixing COGS/fulfillment.");
  if (report.adMetrics.blendedCac > report.unitEconomics.maxAllowableCac) fixes.push("CAC exceeds max allowable CAC; optimize acquisition efficiency.");

  if (fixes.length === 0) {
    fixes.push("Core metrics are healthy. Move to controlled scaling plan.");
  }

  return {
    summary: "Fallback insights generated locally because Ollama was unavailable or returned invalid output.",
    priorityFixes: fixes
  };
}

function parseOllamaInsights(raw: string): InsightPayload | null {
  try {
    const parsed = JSON.parse(raw) as OllamaInsights;
    if (!parsed.summary || !Array.isArray(parsed.priorityFixes)) return null;

    const cleanFixes = parsed.priorityFixes
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .slice(0, 5);

    if (cleanFixes.length === 0) return null;

    return {
      summary: parsed.summary.trim(),
      priorityFixes: cleanFixes
    };
  } catch {
    return null;
  }
}

export async function generateInsights(report: CalculatedReport): Promise<InsightPayload> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.1:8b";

  const prompt = [
    "You are a D2C performance marketing analyst.",
    "Return ONLY strict JSON with this exact shape:",
    '{\"summary\":\"string\",\"priorityFixes\":[\"string\",\"string\",\"string\"]}',
    "Rules:",
    "- Keep summary under 45 words.",
    "- priorityFixes should contain 3-5 concrete actions.",
    "- Use numbers from the input KPIs where useful.",
    "",
    `Input KPI JSON: ${JSON.stringify(report)}`
  ].join("\n");

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        prompt
      })
    });

    if (!res.ok) {
      return fallbackInsights(report);
    }

    const data = (await res.json()) as OllamaGenerateResponse;
    const parsed = data.response ? parseOllamaInsights(data.response) : null;
    if (!parsed) return fallbackInsights(report);

    return parsed;
  } catch {
    return fallbackInsights(report);
  }
}
