/**
 * AI cost ledger: one row per model call (provider, model, purpose, tokens,
 * latency, estimated cost). Best effort: a missing table or failed insert
 * never breaks the pipeline. Prices are estimates, set per env so they can be
 * updated without a deploy.
 */

export type AiCall = {
  provider: "jev" | "gemini" | "jina";
  model: string;
  purpose: string;
  creativeId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  ok: boolean;
  error?: string | null;
};

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** USD per 1M tokens (input, output). Check the providers' price pages. */
export function pricePerMTok(provider: AiCall["provider"]): { input: number; output: number } {
  switch (provider) {
    case "jev":
      return { input: num(process.env.JEV_USD_PER_MTOK_IN, 0.042), output: 0 };
    case "gemini":
      return { input: num(process.env.GEMINI_USD_PER_MTOK_IN, 0.3), output: num(process.env.GEMINI_USD_PER_MTOK_OUT, 2.5) };
    case "jina":
      return { input: num(process.env.JINA_USD_PER_MTOK, 0.02), output: 0 };
  }
}

export function estimateCostUsd(call: Pick<AiCall, "provider" | "inputTokens" | "outputTokens">): number {
  const price = pricePerMTok(call.provider);
  const cost = ((call.inputTokens ?? 0) * price.input + (call.outputTokens ?? 0) * price.output) / 1_000_000;
  return Math.round(cost * 1e8) / 1e8;
}

type Insertable = { from: (table: string) => { insert: (rows: unknown) => PromiseLike<{ error: { message: string } | null }> } };

let disabled = false;

/** Buffered writes: call record() per call and flush() once per batch. */
export function createLedger(client: Insertable) {
  const rows: Record<string, unknown>[] = [];
  return {
    record(call: AiCall) {
      rows.push({
        provider: call.provider,
        model: call.model,
        purpose: call.purpose,
        creative_id: call.creativeId ?? null,
        input_tokens: call.inputTokens ?? null,
        output_tokens: call.outputTokens ?? null,
        latency_ms: call.latencyMs ?? null,
        cost_usd: estimateCostUsd(call),
        ok: call.ok,
        error: call.error ? call.error.slice(0, 300) : null,
      });
    },
    async flush() {
      if (!rows.length || disabled) return;
      const batch = rows.splice(0, rows.length);
      const { error } = await client.from("ai_calls").insert(batch);
      if (error) {
        // Table not created yet (migration not run): stop trying this process.
        if (/42P01|PGRST205|does not exist/i.test(error.message)) disabled = true;
        else console.warn("[ai ledger] insert failed", error.message);
      }
    },
    get size() {
      return rows.length;
    },
  };
}
