/**
 * Caps on what a browser can send to ZWIRK. Every field ends up in the Gemini
 * prompt, so without caps one request could burn a large, paid prompt.
 */

export const ZWIRK_FIELD_MAX_CHARS = 4_000;
export const ZWIRK_MESSAGE_MAX_CHARS = 2_000;
export const ZWIRK_MAX_MESSAGES = 12;
export const ZWIRK_PROMPT_MAX_CHARS = 30_000;

export type ZwirkChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ZwirkInput = {
  messages: ZwirkChatMessage[];
  context?: string;
  competitorContext?: string;
  adSpyContext?: string;
  pagePath: string;
  entityContext: Record<string, unknown> | null;
};

export type ZwirkInputResult =
  | { ok: true; input: ZwirkInput }
  | { ok: false; status: number; error: string };

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Accepts a string or a JSON-able object; returns a string of at most `max` chars. */
export function capTextField(value: unknown, max = ZWIRK_FIELD_MAX_CHARS): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return clip(value, max);
  if (typeof value === "object") {
    try {
      return clip(JSON.stringify(value), max);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * entityContext is an object the prompt builder reads fields from. Keep it only
 * when its JSON form is within the cap; otherwise drop it (a truncated JSON
 * string cannot be read back as an object).
 */
function capEntity(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const json = JSON.stringify(value);
    if (json.length > ZWIRK_FIELD_MAX_CHARS) return null;
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function capMessages(value: unknown): ZwirkChatMessage[] {
  if (!Array.isArray(value)) return [];
  const clean: ZwirkChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (typeof content !== "string" || !content.trim()) continue;
    clean.push({
      role: role === "assistant" ? "assistant" : "user",
      content: clip(content, ZWIRK_MESSAGE_MAX_CHARS),
    });
  }
  // Keep the most recent turns; the latest user message is what gets answered.
  return clean.slice(-ZWIRK_MAX_MESSAGES);
}

export function sanitizeZwirkInput(body: unknown): ZwirkInputResult {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "Invalid request." };
  }
  const raw = body as Record<string, unknown>;
  const messages = capMessages(raw.messages);
  if (messages.length === 0) {
    return { ok: false, status: 400, error: "No messages provided" };
  }

  const input: ZwirkInput = {
    messages,
    context: capTextField(raw.context),
    competitorContext: capTextField(raw.competitorContext),
    adSpyContext: capTextField(raw.adSpyContext),
    pagePath: typeof raw.pagePath === "string" ? clip(raw.pagePath, 200) : "",
    entityContext: capEntity(raw.entityContext),
  };

  if (zwirkInputChars(input) > ZWIRK_PROMPT_MAX_CHARS) {
    return {
      ok: false,
      status: 413,
      error: "This request is too long for ZWIRK. Shorten your message or start a new chat.",
    };
  }
  return { ok: true, input };
}

export function zwirkInputChars(input: ZwirkInput): number {
  let total = 0;
  for (const m of input.messages) total += m.content.length;
  total += input.context?.length ?? 0;
  total += input.competitorContext?.length ?? 0;
  total += input.adSpyContext?.length ?? 0;
  total += input.pagePath.length;
  total += input.entityContext ? JSON.stringify(input.entityContext).length : 0;
  return total;
}
