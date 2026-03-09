import type { CalculatedReport, InsightPayload } from "@/lib/types/domain";

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type ModelInsights = Partial<Omit<InsightPayload, "source" | "latencyMs">>;

function sanitizeList(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildDeterministicInsights(report: CalculatedReport): Omit<InsightPayload, "source" | "latencyMs"> {
  const roas = report.adMetrics.blendedRoas;
  const cac = report.adMetrics.blendedCac;
  const maxCac = report.unitEconomics.maxAllowableCac;
  const cm = report.unitEconomics.contributionMarginPct;
  const npm = report.monthlyPnl.netProfitMarginPct;
  const allocation = report.scalePlanner.allocationTotalPct;

  const priorityFixes: string[] = [];
  const growthLevers: string[] = [];
  const riskAlerts: string[] = [];
  const channelPlan: string[] = [];
  const experimentBacklog: string[] = [];
  const cashflowActions: string[] = [];
  const next30Days: string[] = [];

  if (roas < 3) {
    priorityFixes.push(`Lift blended ROAS from ${roas.toFixed(2)}x to at least 3.00x before budget scale.`);
    riskAlerts.push("Media efficiency is below scale threshold; scaling now can amplify losses.");
    channelPlan.push("Reallocate 10-15% spend from weakest ad set into best-performing audience/creative pair.");
    experimentBacklog.push("Run 2 new offer-led creatives and 1 landing-page angle test focused on conversion intent.");
  } else {
    growthLevers.push("ROAS is above threshold; use controlled scale in 10-15% weekly budget steps.");
    channelPlan.push("Keep winner campaigns stable and scale only top quartile ad sets.");
  }

  if (cac > maxCac) {
    priorityFixes.push(`Reduce CAC from ${cac.toFixed(0)} to <= ${maxCac.toFixed(0)} (max allowable CAC).`);
    riskAlerts.push("Current CAC is above breakeven guardrail.");
    cashflowActions.push("Pause non-performing segments and enforce daily CAC ceiling rules.");
  } else {
    growthLevers.push("CAC is within contribution guardrail; preserve efficiency while scaling.");
  }

  if (cm < 0.3) {
    priorityFixes.push(`Increase contribution margin from ${(cm * 100).toFixed(1)}% to >= 30.0%.`);
    riskAlerts.push("Low contribution margin limits ability to absorb acquisition costs.");
    cashflowActions.push("Cut fulfillment/COGS leakage by 5-8% through SKU and shipping optimization.");
  } else {
    growthLevers.push("Contribution margin is healthy for sustainable paid growth.");
  }

  if (npm < 0.1) {
    priorityFixes.push(`Move net profit margin from ${(npm * 100).toFixed(1)}% to >= 10.0%.`);
    riskAlerts.push("Net profitability is below D2C operating comfort zone.");
  } else {
    growthLevers.push("Net margin profile supports reinvestment and controlled expansion.");
  }

  if (Math.abs(allocation - 1) > 0.01) {
    priorityFixes.push(`Fix channel allocation total to 100% (current ${(allocation * 100).toFixed(1)}%).`);
    riskAlerts.push("Budget allocation mismatch can distort scaling projections.");
  }

  if (priorityFixes.length === 0) {
    priorityFixes.push("Core economics are healthy; execute controlled scaling and protect contribution margin.");
  }

  growthLevers.push("Increase AOV using bundles/threshold offers while maintaining conversion rate.");
  growthLevers.push("Build retention loop (repeat purchase flows) to improve LTV and CAC tolerance.");

  channelPlan.push("Meta: prioritize creative testing velocity and broad+LAL audience split.");
  channelPlan.push("Google: separate brand vs non-brand campaigns and tighten search term controls.");
  channelPlan.push("Reserve 5-10% spend for exploratory tests; kill losers within 7 days.");

  experimentBacklog.push("Test checkout incentive threshold (free shipping vs % discount) on AOV and CVR.");
  experimentBacklog.push("Run PDP trust-block test (UGC/social proof placement) to lift conversion.");
  experimentBacklog.push("Test post-purchase upsell sequence for margin-positive SKUs.");

  cashflowActions.push("Review weekly contribution after ads and hold scale if two consecutive weeks decline.");
  cashflowActions.push("Set monthly media cap tied to target net margin, not only topline.");
  cashflowActions.push("Protect inventory turns to avoid cash lock-in while scaling paid demand.");

  next30Days.push("Week 1: fix unit economics and CAC breaches; freeze scaling.");
  next30Days.push("Week 2: launch creative and landing-page tests; review daily ROAS by campaign.");
  next30Days.push("Week 3: reallocate budgets to winners; cut bottom quartile spend.");
  next30Days.push("Week 4: scale 10-15% if ROAS>=3, CAC<=max allowable, and contribution margin>=30%.");

  return {
    summary:
      "Operator view: stabilize profitability guardrails first, then scale only channels that sustain ROAS, CAC, and contribution thresholds.",
    priorityFixes,
    growthLevers,
    riskAlerts,
    channelPlan,
    experimentBacklog,
    cashflowActions,
    watchlistKpis: [
      `Blended ROAS: ${roas.toFixed(2)}x (target >= 3.00x)`,
      `Blended CAC: ${cac.toFixed(0)} (target <= ${maxCac.toFixed(0)})`,
      `Contribution Margin: ${(cm * 100).toFixed(1)}% (target >= 30.0%)`,
      `Net Profit Margin: ${(npm * 100).toFixed(1)}% (target >= 10.0%)`,
      `Allocation Total: ${(allocation * 100).toFixed(1)}% (target 100%)`,
      `Scale Verdict: ${report.scalePlanner.readiness}`
    ],
    next30Days
  };
}

function mergeInsights(
  base: Omit<InsightPayload, "source" | "latencyMs">,
  model: Omit<InsightPayload, "source" | "latencyMs"> | null
): Omit<InsightPayload, "source" | "latencyMs"> {
  if (!model) return base;
  return {
    summary: model.summary || base.summary,
    priorityFixes: model.priorityFixes.length > 0 ? model.priorityFixes : base.priorityFixes,
    growthLevers: model.growthLevers.length > 0 ? model.growthLevers : base.growthLevers,
    riskAlerts: model.riskAlerts.length > 0 ? model.riskAlerts : base.riskAlerts,
    channelPlan: model.channelPlan.length > 0 ? model.channelPlan : base.channelPlan,
    experimentBacklog: model.experimentBacklog.length > 0 ? model.experimentBacklog : base.experimentBacklog,
    cashflowActions: model.cashflowActions.length > 0 ? model.cashflowActions : base.cashflowActions,
    watchlistKpis: model.watchlistKpis.length > 0 ? model.watchlistKpis : base.watchlistKpis,
    next30Days: model.next30Days.length > 0 ? model.next30Days : base.next30Days
  };
}

function fallbackInsights(report: CalculatedReport, latencyMs: number): InsightPayload {
  const base = buildDeterministicInsights(report);
  return {
    ...base,
    source: "fallback",
    latencyMs
  };
}

function parseModelInsights(raw: string): Omit<InsightPayload, "source" | "latencyMs"> | null {
  const extract = (text: string): ModelInsights | null => {
    try {
      return JSON.parse(text) as ModelInsights;
    } catch {
      return null;
    }
  };

  let parsed = extract(raw);
  if (!parsed) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) parsed = extract(raw.slice(start, end + 1));
  }
  if (!parsed || typeof parsed.summary !== "string") return null;

  return {
    summary: parsed.summary.trim(),
    priorityFixes: sanitizeList(parsed.priorityFixes),
    growthLevers: sanitizeList(parsed.growthLevers),
    riskAlerts: sanitizeList(parsed.riskAlerts),
    channelPlan: sanitizeList(parsed.channelPlan),
    experimentBacklog: sanitizeList(parsed.experimentBacklog),
    cashflowActions: sanitizeList(parsed.cashflowActions),
    watchlistKpis: sanitizeList(parsed.watchlistKpis),
    next30Days: sanitizeList(parsed.next30Days)
  };
}

async function callGemini(apiKey: string, model: string, prompt: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (!apiKey) return null;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 900,
          responseMimeType: "application/json"
        }
      }),
      signal: controller.signal
    });

    if (!res.ok) return null;
    const data = (await res.json()) as GeminiGenerateResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateInsights(report: CalculatedReport): Promise<InsightPayload> {
  const startedAt = Date.now();
  const apiKey = process.env.GEMINI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 25000);
  const deterministic = buildDeterministicInsights(report);

  const kpis = {
    blendedRoas: report.adMetrics.blendedRoas,
    blendedCac: report.adMetrics.blendedCac,
    maxAllowableCac: report.unitEconomics.maxAllowableCac,
    contributionMarginPct: report.unitEconomics.contributionMarginPct,
    netProfitMarginPct: report.monthlyPnl.netProfitMarginPct,
    totalAdSpend: report.adMetrics.totalAdSpend,
    totalRevenue: report.adMetrics.totalRevenue,
    readiness: report.scalePlanner.readiness,
    allocationTotalPct: report.scalePlanner.allocationTotalPct
  };

  const prompt = [
    "You are both a D2C agency owner and performance marketing operator.",
    "Return ONLY strict JSON with no markdown.",
    `Output shape: ${JSON.stringify({
      summary: "string",
      priorityFixes: ["string"],
      growthLevers: ["string"],
      riskAlerts: ["string"],
      channelPlan: ["string"],
      experimentBacklog: ["string"],
      cashflowActions: ["string"],
      watchlistKpis: ["string"],
      next30Days: ["string"]
    })}`,
    "Rules:",
    "- Make items measurable and operator-ready.",
    "- Prioritize profitability, CAC guardrails, and scale readiness.",
    "- Keep each list 3-6 concise bullets.",
    `KPIs: ${JSON.stringify(kpis)}`
  ].join("\n");

  const raw = await callGemini(apiKey, model, prompt, timeoutMs);
  const parsed = raw ? parseModelInsights(raw) : null;
  if (parsed) {
    return {
      ...mergeInsights(deterministic, parsed),
      source: "gemini",
      latencyMs: Date.now() - startedAt
    };
  }

  if (raw) {
    const repairPrompt = [
      "Convert the following text into strict JSON only.",
      "Do not add markdown or extra prose.",
      "Use the same output shape from the previous instruction.",
      `Text: ${raw}`
    ].join("\n");
    const repairedRaw = await callGemini(apiKey, model, repairPrompt, timeoutMs);
    const repaired = repairedRaw ? parseModelInsights(repairedRaw) : null;
    if (repaired) {
      return {
        ...mergeInsights(deterministic, repaired),
        source: "gemini",
        latencyMs: Date.now() - startedAt
      };
    }
  }

  return fallbackInsights(report, Date.now() - startedAt);
}

