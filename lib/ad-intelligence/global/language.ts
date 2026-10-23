import "server-only";

import { francAll } from "franc-min";

export type LanguageSource = "provider" | "heuristic";

export type DetectedLanguage = {
  code: string;
  name: string;
  source: LanguageSource;
  confidence: number;
};

type ScriptRule = {
  code: string;
  name: string;
  script: RegExp;
};

/**
 * Native-script signals. These are intentionally treated as heuristic, not
 * provider facts or audience-targeting data. Devanagari in particular is
 * shared by Hindi, Marathi, Nepali and other languages; the legacy product
 * contract still uses `hi` for this script signal until language-level
 * disambiguation is available.
 */
const SCRIPT_RULES: ScriptRule[] = [
  { code: "hi", name: "Hindi", script: /[\u0900-\u097F]/u },
  { code: "bn", name: "Bengali", script: /[\u0980-\u09FF]/u },
  { code: "pa", name: "Punjabi", script: /[\u0A00-\u0A7F]/u },
  { code: "gu", name: "Gujarati", script: /[\u0A80-\u0AFF]/u },
  { code: "or", name: "Odia", script: /[\u0B00-\u0B7F]/u },
  { code: "ta", name: "Tamil", script: /[\u0B80-\u0BFF]/u },
  { code: "te", name: "Telugu", script: /[\u0C00-\u0C7F]/u },
  { code: "kn", name: "Kannada", script: /[\u0C80-\u0CFF]/u },
  { code: "ml", name: "Malayalam", script: /[\u0D00-\u0D7F]/u },
];

/**
 * `franc-min` returns ISO 639-3 codes; AdSpy stores stable ISO 639-1 codes
 * where available. Keep the map explicit so unknown results are not persisted
 * as opaque three-letter codes that the UI may not understand.
 */
const FRANC_LANGUAGE_MAP: Record<string, { code: string; name: string }> = {
  eng: { code: "en", name: "English" },
  hin: { code: "hi", name: "Hindi" },
  ben: { code: "bn", name: "Bengali" },
  pan: { code: "pa", name: "Punjabi" },
  guj: { code: "gu", name: "Gujarati" },
  ori: { code: "or", name: "Odia" },
  tam: { code: "ta", name: "Tamil" },
  tel: { code: "te", name: "Telugu" },
  kan: { code: "kn", name: "Kannada" },
  mal: { code: "ml", name: "Malayalam" },
  mar: { code: "mr", name: "Marathi" },
  nep: { code: "ne", name: "Nepali" },
  urd: { code: "ur", name: "Urdu" },
  arb: { code: "ar", name: "Arabic" },
  ara: { code: "ar", name: "Arabic" },
  spa: { code: "es", name: "Spanish" },
  por: { code: "pt", name: "Portuguese" },
  fra: { code: "fr", name: "French" },
  deu: { code: "de", name: "German" },
  ita: { code: "it", name: "Italian" },
  nld: { code: "nl", name: "Dutch" },
  ind: { code: "id", name: "Indonesian" },
  vie: { code: "vi", name: "Vietnamese" },
  rus: { code: "ru", name: "Russian" },
  tur: { code: "tr", name: "Turkish" },
  tha: { code: "th", name: "Thai" },
  jpn: { code: "ja", name: "Japanese" },
  kor: { code: "ko", name: "Korean" },
  cmn: { code: "zh", name: "Chinese" },
};

// Common English function words are a stronger signal than product terms.
const ENGLISH_FUNCTION_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and", "any", "are", "as", "at",
  "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "cannot", "could",
  "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further", "had", "has", "have",
  "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is",
  "it", "its", "itself", "just", "me", "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off",
  "on", "once", "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should",
  "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these",
  "they", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were", "what",
  "when", "where", "which", "while", "who", "whom", "why", "will", "with", "would", "you", "your", "yours",
]);

// English vocabulary helps on shorter ad captions that are too small for franc.
const ENGLISH_CONTENT_WORDS = new Set([
  "achieve", "active", "add", "advanced", "amazing", "available", "award", "awesome", "beautiful", "benefit", "benefits",
  "best", "better", "boost", "brand", "bright", "care", "claims", "clean", "collection", "complete", "comfort", "comfortable",
  "confidence", "convenient", "crafted", "create", "daily", "deal", "designed", "discover", "easy", "effective", "exclusive",
  "experience", "expect", "explore", "family", "fast", "feel", "find", "free", "fresh", "get", "gift", "give", "glow",
  "good", "great", "health", "help", "home", "improve", "includes", "incredible", "introducing", "just", "launch", "learn",
  "life", "limited", "love", "made", "make", "meet", "new", "offer", "offers", "official", "only", "perfect", "premium",
  "price", "protection", "protect", "quality", "quick", "ready", "real", "results", "safe", "save", "shop", "skin", "skincare",
  "solution", "special", "start", "style", "support", "take", "today", "try", "trusted", "unforgettable", "upgrade", "use",
  "value", "welcome", "work", "world", "worth", "yourself", "insurance", "settlement", "plan", "product", "products", "claim",
  "carefully", "delivered", "delivery", "deserves", "exclusive", "family", "finest", "from", "hurry", "instant", "long", "lasting",
  "natural", "order", "original", "performance", "personal", "premium", "proven", "reliable", "routine", "sale", "shop", "show",
  "simple", "strong", "super", "value", "verified", "wear", "while", "wish", "without", "zero", "every", "anywhere", "anytime",
]);

// Romanized Hindi vocabulary for common Hinglish ad copy.
const ROMAN_HINDI_WORDS = new Set([
  "ab", "acha", "achha", "achhi", "achhe", "accha", "acchi", "acche", "aap", "aapka", "aapki", "aapke", "apka", "apki",
  "apke", "apna", "apni", "apne", "apko", "aapko", "bahut", "bas", "bhi", "bhai", "chahiye", "chahe", "chahti", "chahta",
  "chalo", "dekho", "diya", "doosra", "ekdum", "hai", "hain", "har", "hona", "hone", "hota", "hoti", "hote", "ho", "hoon",
  "hum", "hamara", "hamari", "hamare", "isme", "isse", "iska", "iski", "iske", "isliye", "itna", "itni", "itne", "jaise",
  "jab", "jahan", "jiye", "jo", "ka", "kaafi", "kaisa", "kaise", "kar", "kara", "karna", "karta", "karte", "karti", "karo",
  "karoge", "karlo", "ke", "ki", "kuch", "kyu", "kyun", "kya", "le", "lekin", "liye", "lo", "log", "logo", "mein", "mai",
  "mera", "meri", "mere", "milega", "milega", "milti", "mujhe", "mujh", "na", "nahi", "nahin", "nhi", "naam", "naya", "nayi",
  "naye", "par", "pe", "pehle", "phir", "raha", "rahe", "rahi", "rakh", "sakta", "sakti", "sakte", "sab", "saath", "sirf",
  "toh", "thaa", "tha", "the", "thi", "thoda", "tum", "tumhara", "tumhari", "tumhare", "tu", "unka", "unki", "unke", "use",
  "wala", "wale", "wali", "waise", "wahi", "woh", "wo", "yaar", "ye", "yeh", "yahan", "zara", "zyada", "kam", "kyunki",
  "lagta", "lagti", "lagte", "matlab", "hota", "hoti", "hote", "bana", "banao", "banaye", "badhiya", "accha", "sach", "sahi",
]);

const MIN_FRANC_LATIN_CHARS = 180;
const MIN_FRANC_GAP = 0.08;

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\u00A0/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokenizeLatin(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{Script=Latin}'\s]/gu, " ")
    .split(/\s+/u)
    .map((word) => word.replace(/^'+|'+$/gu, ""))
    .filter(Boolean);
}

function latinOnlyText(text: string): string {
  return text
    .replace(/[^\p{Script=Latin}\p{M}'\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function scriptConfidence(text: string, script: RegExp): number {
  const matches = text.match(new RegExp(script.source, "gu")) ?? [];
  if (matches.length === 0) return 0;
  const ratio = matches.length / Math.max(text.length, 1);
  return Math.min(0.995, 0.78 + Math.min(ratio * 0.8, 0.2));
}

function englishScore(words: string[]): number {
  if (words.length < 5) return 0;

  const functionWordCount = words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word)).length;
  const contentWordCount = words.filter((word) => ENGLISH_CONTENT_WORDS.has(word)).length;
  const functionRatio = functionWordCount / words.length;
  const contentRatio = contentWordCount / words.length;

  // Require multiple function words to avoid treating brand/product names as English.
  if (functionWordCount >= 3 && functionRatio >= 0.1) {
    return Math.min(0.92, 0.68 + functionRatio * 0.8 + Math.min(contentRatio * 0.15, 0.08));
  }

  if (words.length >= 8 && contentWordCount >= 4 && contentRatio >= 0.25) {
    return Math.min(0.85, 0.6 + contentRatio * 0.5);
  }

  return 0;
}

function romanHindiScore(words: string[]): number {
  if (words.length < 6) return 0;
  const recognized = words.filter((word) => ROMAN_HINDI_WORDS.has(word)).length;
  if (recognized < 3) return 0;
  const ratio = recognized / words.length;
  if (ratio < 0.18) return 0;
  return Math.min(0.96, 0.44 + ratio * 0.8);
}

/**
 * Uses a language-ID model only on sufficiently long Latin-script text.
 * `franc-min` warns that short samples are easy to confuse; ambiguous results
 * are discarded rather than persisted as confident language tags.
 */
function detectLatinLanguage(text: string): DetectedLanguage | null {
  const latinText = latinOnlyText(text);
  if (latinText.length < MIN_FRANC_LATIN_CHARS) return null;

  try {
    const ranking = francAll(latinText.slice(0, 2048), { minLength: MIN_FRANC_LATIN_CHARS });
    const winner = ranking[0];
    if (!winner || winner[0] === "und") return null;

    const mapped = FRANC_LANGUAGE_MAP[winner[0]];
    if (!mapped) return null;

    const runnerUp = ranking[1]?.[1] ?? 0;
    const gap = winner[1] - runnerUp;
    if (gap < MIN_FRANC_GAP) return null;

    // This is a heuristic confidence score from ranking separation, not a
    // calibrated probability. It is intentionally capped below provider data.
    const confidence = Math.min(0.96, 0.72 + gap * 0.8);
    return {
      code: mapped.code,
      name: mapped.name,
      source: "heuristic",
      confidence,
    };
  } catch {
    // Language identification must never break ad ingestion if it errors.
    return null;
  }
}

/**
 * Detects likely creative languages from text.
 *
 * Important:
 * - Results are heuristic tags, not provider facts or Meta audience targeting.
 * - Scripts and latin-language identification can return more than one label
 *   for genuinely mixed-language copy.
 * - Short text is deliberately left unclassified when the signal is weak.
 */
export function detectLanguages(input: string): DetectedLanguage[] {
  const text = normalizeText(input);
  if (!text) return [];

  const results = new Map<string, DetectedLanguage>();
  const add = (language: DetectedLanguage) => {
    const code = language.code.trim().toLowerCase();
    if (!code) return;
    const previous = results.get(code);
    if (!previous || language.confidence > previous.confidence) {
      results.set(code, { ...language, code });
    }
  };

  // 1. Native-script signals, retained for short native-language captions.
  for (const rule of SCRIPT_RULES) {
    const confidence = scriptConfidence(text, rule.script);
    if (confidence > 0) {
      add({ code: rule.code, name: rule.name, source: "heuristic", confidence });
    }
  }

  // 2. Longer Latin-script copy: use a general language-ID model plus
  // conservative English lexical fallback for common short ad captions.
  const words = tokenizeLatin(text);
  const latinLanguage = detectLatinLanguage(text);
  if (latinLanguage) add(latinLanguage);

  const enScore = englishScore(words);
  if (enScore >= 0.62) {
    add({ code: "en", name: "English", source: "heuristic", confidence: enScore });
  }

  // 3. Romanized Hindi/Hinglish. This intentionally requires several known
  // tokens and a minimum proportion so a lone "hai" or brand name is not enough.
  const hiScore = romanHindiScore(words);
  if (hiScore >= 0.62) {
    add({
      code: "hinglish",
      name: "Hinglish",
      source: "heuristic",
      confidence: hiScore,
    });
  }

  // 4. Devanagari mixed with clear English is commonly mixed Hindi/Hinglish.
  const devanagariCharacterCount = (text.match(/[\u0900-\u097F]/gu) ?? []).length;
  if (results.has("hi") && devanagariCharacterCount >= 8 && (results.has("en") || enScore >= 0.58)) {
    add({
      code: "hinglish",
      name: "Hinglish",
      source: "heuristic",
      confidence: Math.min(0.96, 0.58 + Math.max(enScore, results.get("en")?.confidence ?? 0) * 0.35),
    });
  }

  return Array.from(results.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);
}
