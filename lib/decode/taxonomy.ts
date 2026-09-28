/**
 * The creative element taxonomy an AI model fills in for every ad. Fixed,
 * small value lists so answers can be counted and compared across brands.
 * Pure; unit tested in taxonomy.test.ts.
 */

export const TAXONOMY_VERSION = 1;

export const ELEMENTS = {
  hookType: ["offer", "claim_with_number", "question", "social_proof", "problem_first", "demo", "testimonial", "founder_story", "launch", "comparison", "statement"],
  angle: ["price_value", "results", "ingredients", "convenience", "premium_status", "trust_safety", "lifestyle", "gifting", "festive", "problem_solution"],
  persona: ["students", "young_professionals", "parents", "women", "men", "homemakers", "fitness", "general"],
  visualStyle: ["ugc_selfie", "studio_product", "lifestyle_scene", "before_after", "text_graphic", "animation", "influencer", "demo_closeup"],
  peopleOnScreen: ["none", "one", "several"],
  language: ["english", "hindi", "hinglish", "tamil", "telugu", "kannada", "malayalam", "marathi", "bengali", "other"],
  emotion: ["aspirational", "urgency", "humour", "trust", "calm", "fomo", "curiosity"],
  textDensity: ["low", "medium", "high"],
} as const;

export type ElementKey = keyof typeof ELEMENTS;
export type Decoded = {
  [K in ElementKey]: (typeof ELEMENTS)[K][number] | null;
} & {
  offerPresent: boolean | null;
  productFocus: string | null;
  summary: string | null;
};

export const ELEMENT_LABEL: Record<ElementKey, string> = {
  hookType: "Hook type",
  angle: "Angle",
  persona: "Persona",
  visualStyle: "Visual style",
  peopleOnScreen: "People on screen",
  language: "Language",
  emotion: "Emotion",
  textDensity: "Text on creative",
};

export function valueLabel(value: string): string {
  const special: Record<string, string> = { ugc_selfie: "UGC selfie", fomo: "FOMO", claim_with_number: "Claim with a number", price_value: "Price / value" };
  if (special[value]) return special[value];
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

function pick<K extends ElementKey>(key: K, raw: unknown): Decoded[K] {
  const value = clean(raw).toLowerCase().replace(/[\s-]+/g, "_");
  return ((ELEMENTS[key] as readonly string[]).includes(value) ? value : null) as Decoded[K];
}

/** Keep only answers inside the taxonomy; anything else becomes null. */
export function normalizeDecoded(raw: unknown): Decoded {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as Decoded;
  for (const key of Object.keys(ELEMENTS) as ElementKey[]) {
    (out as Record<string, unknown>)[key] = pick(key, obj[key]);
  }
  out.offerPresent = typeof obj.offerPresent === "boolean" ? obj.offerPresent : null;
  const product = clean(obj.productFocus);
  out.productFocus = product ? product.slice(0, 60) : null;
  const summary = clean(obj.summary);
  out.summary = summary ? summary.slice(0, 180) : null;
  return out;
}

/** The instruction sent to the vision model with the ad image and copy. */
export function decodePrompt(input: { advertiser: string | null; headline: string | null; copy: string | null; cta: string | null; format: string | null }): string {
  const lists = (Object.keys(ELEMENTS) as ElementKey[]).map((k) => `- ${k}: one of ${ELEMENTS[k].join(", ")}`).join("\n");
  return [
    "You label one Meta ad from an Indian D2C brand for competitive research.",
    "Look at the image (if any) and read the copy. Answer ONLY with JSON, no prose.",
    "Use exactly these keys and only the listed values (or null when you cannot tell):",
    lists,
    "- offerPresent: true or false",
    "- productFocus: the product or category in at most 6 words, or null",
    "- summary: one plain sentence (max 25 words) on what the ad says and to whom",
    "",
    `Advertiser: ${clean(input.advertiser) || "unknown"}`,
    `Format: ${clean(input.format) || "unknown"}`,
    `Headline: ${clean(input.headline).slice(0, 300) || "none"}`,
    `Copy: ${clean(input.copy).slice(0, 1200) || "none"}`,
    `Call to action: ${clean(input.cta) || "none"}`,
  ].join("\n");
}

/** Pull the first JSON object out of a model reply (tolerates code fences). */
export function parseModelJson(text: string | null | undefined): unknown {
  const value = String(text ?? "").trim();
  if (!value) return null;
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    return null;
  }
}

export type PatternCount = { key: ElementKey; value: string; label: string; count: number; share: number };

/**
 * Most common value per element. The share is out of the ads where that
 * element is known: text-only (Jev) labels have no visual fields, and an
 * "unclear" answer should not dilute the others.
 */
export function topPatterns(decodes: Decoded[], perElement = 2): PatternCount[] {
  if (!decodes.length) return [];
  const out: PatternCount[] = [];
  for (const key of Object.keys(ELEMENTS) as ElementKey[]) {
    const counts = new Map<string, number>();
    let total = 0;
    for (const d of decodes) {
      const v = d[key];
      if (v) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
        total += 1;
      }
    }
    if (!total) continue;
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, perElement)
      .forEach(([value, count]) => out.push({ key, value, label: valueLabel(value), count, share: Math.round((count / total) * 100) }));
  }
  return out;
}


/** Env values pasted as KEY="value" keep their quotes on some loaders. */
export function cleanEnvValue(value: string | undefined | null): string {
  const v = String(value ?? "").trim();
  const m = /^(["'])(.*)\1$/.exec(v);
  return (m ? m[2] : v).trim();
}

/** Hours before a failed decode is tried again. */
export const DECODE_RETRY_HOURS = 6;

/** True when an existing decode row means "leave this ad alone for now". */
export function shouldSkipDecode(row: { status: string | null; decoded_at: string | null }, now: number = Date.now()): boolean {
  if (row.status !== "failed") return true;
  const at = row.decoded_at ? Date.parse(row.decoded_at) : NaN;
  if (!Number.isFinite(at)) return false;
  return now - at < DECODE_RETRY_HOURS * 3_600_000;
}

/** Timeouts and Google-side errors are worth one immediate retry. */
export function isRetryableError(message: string): boolean {
  return /abort|timeout|timed out|ECONNRESET|fetch failed|Gemini 5\d\d/i.test(message);
}

/** Errors caused by the key or model name, not by the ad. */
export function isKeyError(message: string): boolean {
  return /API key not valid|API_KEY_INVALID|PERMISSION_DENIED|Gemini 40[13]|Gemini 404|is not found for API version|models\/[^ ]+ is not found/i.test(message);
}
