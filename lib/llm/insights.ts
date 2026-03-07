import type { CalculatedReport, InsightPayload } from "@/lib/types/domain";

type OllamaGenerateResponse = {
  response?: string;
};

type OllamaInsights = {
  summary?: string;
  priorityFixes?: string[];
};

function fallbackInsights(report: CalculatedReport, latencyMs: number): InsightPayload {
  const fixes: string[] = [];

  if (report.adMetrics.blendedRoas < 3) fixes.push("Improve ROAS to at least 3x before scaling budgets.");
  if (report.unitEconomics.contributionMarginPct < 0.3) fixes.push("Increase contribution margin above 30% by fixing COGS/fulfillment.");
  if (report.adMetrics.blendedCac > report.unitEconomics.maxAllowableCac) fixes.push("CAC exceeds max allowable CAC; optimize acquisition efficiency.");

  if (fixes.length === 0) {
    fixes.push("Core metrics are healthy. Move to controlled scaling plan.");
  }

  return {
    summary: "Fallback insights generated locally because Ollama was unavailable or returned invalid output.",
    priorityFixes: fixes,
    source: "fallback",
    latencyMs
  };
}

function parseOllamaInsights(raw: string): Omit<InsightPayload, "source" | "latencyMs"> | null {
  const extract = (text: string): OllamaInsights | null => {
    try {
      return JSON.parse(text) as OllamaInsights;
    } catch {
      return null;
    }
  };

  let parsed = extract(raw);
  if (!parsed) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = extract(raw.slice(start, end + 1));
    }
  }

  if (!parsed || !parsed.summary || !Array.isArray(parsed.priorityFixes)) return null;

  const cleanFixes = parsed.priorityFixes
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 5);

  if (cleanFixes.length === 0) return null;

  return {
    summary: parsed.summary.trim(),
    priorityFixes: cleanFixes
  };
}

async function callOllama(baseUrl: string, model: string, prompt: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        prompt,
        options: {
          num_predict: 180,
          temperature: 0.2
        }
      }),
      signal: controller.signal
    });

    if (!res.ok) return null;
    const data = (await res.json()) as OllamaGenerateResponse;
    return data.response ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateInsights(report: CalculatedReport): Promise<InsightPayload> {
  const startedAt = Date.now();
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.1:8b";
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 25000);

  const kpis = {
    blendedRoas: report.adMetrics.blendedRoas,
    blendedCac: report.adMetrics.blendedCac,
    maxAllowableCac: report.unitEconomics.maxAllowableCac,
    contributionMarginPct: report.unitEconomics.contributionMarginPct,
    netProfitMarginPct: report.monthlyPnl.netProfitMarginPct,
    totalAdSpend: report.adMetrics.totalAdSpend,
    totalRevenue: report.adMetrics.totalRevenue,
    readiness: report.scalePlanner.readiness
  };

  const prompt = [
    "You are a D2C Growth expert .",
    "Return ONLY valid JSON.",
    '{"summary":"string","priorityFixes":["string","string","string"]}',
    "Rules: summary ; priorityFixes- measurable actions; no markdown .",
    `KPIs: ${JSON.stringify(kpis)}`
  ].join("\n");

  const raw = await callOllama(baseUrl, model, prompt, timeoutMs);
  const parsed = raw ? parseOllamaInsights(raw) : null;

  if (parsed) {
    return {
      ...parsed,
      source: "ollama",
      latencyMs: Date.now() - startedAt
    };
  }

  if (raw) {
    const repairPrompt = [
      "Convert the following text into strict JSON only.",
      "Output shape: {\"summary\":\"string\",\"priorityFixes\":[\"string\",\"string\",\"string\"]}",
      "No extra text. No markdown.",
      `Text: ${raw}`
    ].join("\n");

    const repairedRaw = await callOllama(baseUrl, model, repairPrompt, timeoutMs);
    const repaired = repairedRaw ? parseOllamaInsights(repairedRaw) : null;

    if (repaired) {
      return {
        ...repaired,
        source: "ollama",
        latencyMs: Date.now() - startedAt
      };
    }
  }

  return fallbackInsights(report, Date.now() - startedAt);
}
