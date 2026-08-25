import "server-only";

export type LanguageSource =
  | "provider"
  | "heuristic";

export type DetectedLanguage = {
  code: string;
  name: string;
  source: LanguageSource;
  confidence: number;
};

/* =========================================================
 * SCRIPT DETECTION
 * ======================================================= */

const SCRIPT_RULES: Array<{
  code: string;
  name: string;
  script: RegExp;
}> = [
  {
    code: "hi",
    name: "Hindi",
    script: /[\u0900-\u097F]/u,
  },
  {
    code: "bn",
    name: "Bengali",
    script: /[\u0980-\u09FF]/u,
  },
  {
    code: "pa",
    name: "Punjabi",
    script: /[\u0A00-\u0A7F]/u,
  },
  {
    code: "gu",
    name: "Gujarati",
    script: /[\u0A80-\u0AFF]/u,
  },
  {
    code: "ta",
    name: "Tamil",
    script: /[\u0B80-\u0BFF]/u,
  },
  {
    code: "te",
    name: "Telugu",
    script: /[\u0C00-\u0C7F]/u,
  },
  {
    code: "kn",
    name: "Kannada",
    script: /[\u0C80-\u0CFF]/u,
  },
  {
    code: "ml",
    name: "Malayalam",
    script: /[\u0D00-\u0D7F]/u,
  },
  {
    code: "or",
    name: "Odia",
    script: /[\u0B00-\u0B7F]/u,
  },
];

/* =========================================================
 * ENGLISH / LATIN VOCABULARY
 *
 * This is deliberately broader than the old detector.
 * It is still a heuristic, not a provider fact.
 * ======================================================= */

const ENGLISH_WORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "and",
  "are",
  "at",
  "be",
  "best",
  "buy",
  "by",
  "can",
  "care",
  "day",
  "do",
  "for",
  "from",
  "get",
  "give",
  "go",
  "good",
  "great",
  "have",
  "here",
  "how",
  "in",
  "is",
  "it",
  "just",
  "know",
  "learn",
  "like",
  "make",
  "more",
  "most",
  "my",
  "new",
  "now",
  "of",
  "on",
  "only",
  "our",
  "out",
  "over",
  "perfect",
  "product",
  "products",
  "shop",
  "show",
  "skin",
  "skincare",
  "start",
  "that",
  "the",
  "their",
  "this",
  "to",
  "today",
  "use",
  "with",
  "your",
  "you",
]);

/* =========================================================
 * HINDI / HINGLISH VOCABULARY
 *
 * Romanized Hindi helps detect Hinglish even when the
 * creative contains no Devanagari characters.
 * ======================================================= */

const ROMAN_HINDI_WORDS = new Set([
  "ab",
  "acha",
  "accha",
  "aap",
  "apka",
  "apni",
  "bahut",
  "bhi",
  "chahiye",
  "hai",
  "hain",
  "har",
  "hum",
  "kar",
  "karo",
  "kaise",
  "kya",
  "kyu",
  "kyun",
  "lekin",
  "mera",
  "meri",
  "mere",
  "mujhe",
  "nahi",
  "nahin",
  "sab",
  "sirf",
  "thoda",
  "toh",
  "tum",
  "tumhara",
  "wala",
  "wale",
  "wali",
]);

/* =========================================================
 * NORMALIZATION
 * ======================================================= */

function normalizeText(
  text: string,
): string {
  return text
    .normalize("NFKC")
    .replace(
      /[\u200B-\u200D\uFEFF]/g,
      "",
    )
    .replace(
      /\u00A0/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function tokenizeLatin(
  text: string,
): string[] {
  return text
    .toLowerCase()
    .replace(
      /[^a-z'\s]/g,
      " ",
    )
    .split(/\s+/)
    .map(
      (word) =>
        word.replace(
          /^'+|'+$/g,
          "",
        ),
    )
    .filter(
      Boolean,
    );
}

/* =========================================================
 * SCRIPT CONFIDENCE
 * ======================================================= */

function scriptConfidence(
  text: string,
  script: RegExp,
): number {
  const matches =
    text.match(
      new RegExp(
        script.source,
        "gu",
      ),
    ) ?? [];

  if (!matches.length) {
    return 0;
  }

  const ratio =
    matches.length /
    Math.max(
      text.length,
      1,
    );

  return Math.min(
    0.995,
    0.78 +
      Math.min(
        ratio * 0.8,
        0.2,
      ),
  );
}

/* =========================================================
 * ENGLISH SCORE
 * ======================================================= */

function englishScore(
  words: string[],
): number {
  if (!words.length) {
    return 0;
  }

  const recognized =
    words.filter(
      (word) =>
        ENGLISH_WORDS.has(
          word,
        ),
    ).length;

  const ratio =
    recognized /
    words.length;

  /*
   * A recognizable English vocabulary signal.
   */
  return Math.min(
    0.99,
    0.42 +
      ratio * 0.58,
  );
}

/* =========================================================
 * ROMAN HINDI SCORE
 * ======================================================= */

function romanHindiScore(
  words: string[],
): number {
  if (!words.length) {
    return 0;
  }

  const recognized =
    words.filter(
      (word) =>
        ROMAN_HINDI_WORDS.has(
          word,
        ),
    ).length;

  if (!recognized) {
    return 0;
  }

  return Math.min(
    0.96,
    0.5 +
      (
        recognized /
        words.length
      ) *
        0.46,
  );
}

/* =========================================================
 * DETECTOR
 * ======================================================= */

/**
 * Detects one or more likely languages.
 *
 * Important:
 * - This is heuristic data.
 * - It does NOT claim Meta targeting information.
 * - A creative can legitimately return multiple languages.
 */
export function detectLanguages(
  input: string,
): DetectedLanguage[] {
  const text =
    normalizeText(
      input,
    );

  if (!text) {
    return [];
  }

  const results =
    new Map<
      string,
      DetectedLanguage
    >();

  /*
   * 1. Indian scripts
   */
  for (
    const rule of
      SCRIPT_RULES
  ) {
    const confidence =
      scriptConfidence(
        text,
        rule.script,
      );

    if (
      confidence <= 0
    ) {
      continue;
    }

    results.set(
      rule.code,
      {
        code:
          rule.code,

        name:
          rule.name,

        source:
          "heuristic",

        confidence,
      },
    );
  }

  /*
   * 2. Latin-script analysis
   */
  const words =
    tokenizeLatin(
      text,
    );

  if (
    words.length
  ) {
    const en =
      englishScore(
        words,
      );

    const hi =
      romanHindiScore(
        words,
      );

    /*
     * Strong English signal.
     */
    if (
      en >= 0.62
    ) {
      results.set(
        "en",
        {
          code:
            "en",

          name:
            "English",

          source:
            "heuristic",

          confidence:
            en,
        },
      );
    }

    /*
     * Romanized Hindi.
     *
     * We deliberately call this Hinglish when English
     * is also a meaningful component.
     */
    if (
      hi >= 0.62
    ) {
      results.set(
        "hinglish",
        {
          code:
            "hinglish",

          name:
            "Hinglish",

          source:
            "heuristic",

          confidence:
            Math.min(
              0.96,
              (
                hi +
                Math.max(
                  en,
                  0.55,
                )
              ) /
                2,
            ),
        },
      );
    }

    /*
     * Hindi script + Latin words is commonly mixed Hindi/
     * Hinglish creative content.
     */
    if (
      results.has("hi") &&
      en >= 0.58
    ) {
      results.set(
        "hinglish",
        {
          code:
            "hinglish",

          name:
            "Hinglish",

          source:
            "heuristic",

          confidence:
            Math.min(
              0.96,
              0.58 +
                en * 0.35,
            ),
        },
      );
    }
  }

  /*
   * 3. Sort strongest signals first.
   *
   * Limit to the strongest four so a noisy creative doesn't
   * create a dozen meaningless language labels.
   */
  return Array.from(
    results.values(),
  )
    .sort(
      (a, b) =>
        b.confidence -
        a.confidence,
    )
    .slice(
      0,
      4,
    );
}