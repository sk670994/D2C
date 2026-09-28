/**
 * Jev (TypeSafe AI): typed decisions on text. Returns a choice, a score or a
 * yes/no probability per question; never free text. Cheap ($0.042 per 1M
 * input tokens, output free) and fast (~100 ms), so it can run on every ad.
 * Text only: images/video stay with Gemini.
 * API: POST https://api.typesafe.ai/v1/systemone  (Authorization: Bearer)
 * Key: console.typesafe.ai/settings/keys -> TYPESAFE_API_KEY
 */

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export type JevQuestion =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> | string[] }
  | { type: "score"; instructions: string; criteria: string[] };

export type JevAnswer = {
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  score?: number;
  noul?: number;
};

export type JevResult = {
  model: string;
  answers: Record<string, JevAnswer>;
  inputTokens: number;
  outputTokens: number;
  ms: number;
};

export class JevError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export function jevKey(): string | null {
  const raw = (process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY)?.trim().replace(/^["']|["']$/g, "");
  return raw ? raw : null;
}

export function jevModel(): string {
  return process.env.JEV_MODEL?.trim() || "jev-latest";
}

/** One request: every question is answered against the same state. */
export async function askJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  options: { apiKey?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<JevResult> {
  const apiKey = options.apiKey ?? jevKey();
  if (!apiKey) throw new JevError("TYPESAFE_API_KEY is not set", null, false);
  const started = Date.now();
  const send = () =>
    (options.fetchImpl ?? fetch)(JEV_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: jevModel(), state, questions }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });

  let response: Response | null = null;
  // 429 / 529: back off twice, then give up for this run.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await send();
    } catch (error) {
      if (attempt === 2) throw new JevError(`Jev unreachable: ${error instanceof Error ? error.message : String(error)}`, null, true);
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    if (response.status !== 429 && response.status !== 529) break;
    await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
  }
  if (!response) throw new JevError("Jev: no response", null, true);
  const json = (await response.json().catch(() => null)) as {
    model?: string;
    answers?: Record<string, JevAnswer>;
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: unknown;
    detail?: unknown;
  } | null;
  if (!response.ok) {
    const detail = typeof json?.detail === "string" ? json.detail : typeof json?.error === "string" ? json.error : `HTTP ${response.status}`;
    throw new JevError(`Jev ${response.status}: ${detail}`, response.status, response.status === 429 || response.status >= 500);
  }
  return {
    model: json?.model ?? jevModel(),
    answers: json?.answers ?? {},
    inputTokens: Number(json?.usage?.input_tokens ?? 0),
    outputTokens: Number(json?.usage?.output_tokens ?? 0),
    ms: Date.now() - started,
  };
}

/** The picked option and how sure Jev is (probability of the pick). */
export function choiceOf(answer: JevAnswer | undefined): { value: string | null; confidence: number } {
  if (!answer?.choice) return { value: null, confidence: 0 };
  const p = answer.probabilities?.[answer.choice];
  const confidence = typeof answer.confidence === "number" ? answer.confidence : typeof p === "number" ? p : 0;
  return { value: answer.choice, confidence };
}

export function noulOf(answer: JevAnswer | undefined): number | null {
  return typeof answer?.noul === "number" && Number.isFinite(answer.noul) ? answer.noul : null;
}
