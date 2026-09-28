/**
 * Jev questions for the text side of the ad taxonomy (taxonomy.ts), plus the
 * rules that merge Jev's text labels with Gemini's visual read. Pure.
 *
 * Jev reads copy only, so it answers: hook, angle, persona, language,
 * emotion, offer present. Gemini (image) answers visual style, people on
 * screen, text density, product focus and the one-line summary.
 */
import type { JevAnswer, JevQuestion } from "@/lib/ai/jev";
import { choiceOf, noulOf } from "@/lib/ai/jev";
import { ELEMENTS, normalizeDecoded, type Decoded, type ElementKey } from "./taxonomy";

/** Elements Jev can judge from the words alone. */
export const TEXT_ELEMENTS = ["hookType", "angle", "persona", "language", "emotion"] as const satisfies readonly ElementKey[];
export type TextElement = (typeof TEXT_ELEMENTS)[number];

/** Below this, a Jev label is not shown (the element stays "unclear"). */
export const MIN_CONFIDENCE = Number(process.env.JEV_MIN_CONFIDENCE) || 0.6;
/** When Gemini also answered, keep Jev's label only above this. */
export const PREFER_JEV_ABOVE = 0.8;

/** Rubrics: Jev reads literally, so every option says what counts. */
const RUBRIC: Record<TextElement, Record<string, string>> = {
  hookType: {
    offer: "Opens with a discount, deal, free gift or price.",
    claim_with_number: "Opens with a result or fact carrying a number (e.g. '94% stronger hair', '2x faster').",
    question: "Opens by asking the reader a question.",
    social_proof: "Opens with reviews, ratings, customer counts or 'bestseller'.",
    problem_first: "Opens by naming a pain point or problem the reader has.",
    demo: "Describes the product being used or shown working.",
    testimonial: "A customer or creator speaking in first person about their experience.",
    founder_story: "The founder or brand story speaks.",
    launch: "Announces something new: a launch, new flavour, new range.",
    comparison: "Compares with another product, brand or the old way.",
    statement: "A plain brand or product statement; none of the above.",
  },
  angle: {
    price_value: "Sells on price, savings, value for money.",
    results: "Sells on outcomes: what changes for the user.",
    ingredients: "Sells on ingredients, materials, specs or formulation.",
    convenience: "Sells on ease, speed, saving time or effort.",
    premium_status: "Sells on luxury, premium quality, status.",
    trust_safety: "Sells on safety, certification, dermat/doctor tested, natural, toxin-free.",
    lifestyle: "Sells a mood or way of life more than the product.",
    gifting: "Positions the product as a gift.",
    festive: "Ties to a festival or season (Diwali, Rakhi, sale season).",
    problem_solution: "Frames a clear problem and the product as its fix.",
  },
  persona: {
    students: "Written for students or college-goers.",
    young_professionals: "Written for young working adults.",
    parents: "Written for parents, about children or babies.",
    women: "Clearly written for women.",
    men: "Clearly written for men.",
    homemakers: "Written for people running a household.",
    fitness: "Written for gym-goers, athletes, fitness fans.",
    general: "No specific audience is targeted.",
  },
  language: {
    english: "Mostly English.",
    hindi: "Mostly Hindi (Devanagari or romanised Hindi sentences).",
    hinglish: "Hindi and English mixed in the same sentences.",
    tamil: "Mostly Tamil.",
    telugu: "Mostly Telugu.",
    kannada: "Mostly Kannada.",
    malayalam: "Mostly Malayalam.",
    marathi: "Mostly Marathi.",
    bengali: "Mostly Bengali.",
    other: "Another language.",
  },
  emotion: {
    aspirational: "Makes the reader want to become or have something better.",
    urgency: "Pushes to act now: limited time, ends tonight, few left.",
    humour: "Tries to be funny.",
    trust: "Reassures: safe, proven, trusted.",
    calm: "Soft, soothing, gentle tone.",
    fomo: "Suggests others already have it and the reader is missing out.",
    curiosity: "Teases something to make the reader want to find out more.",
  },
};

const INSTRUCTIONS: Record<TextElement, string> = {
  hookType: "How does this Meta ad's copy open? Judge the first line or headline.",
  angle: "What is the main reason to buy that this ad's copy argues?",
  persona: "Who is this ad's copy written for?",
  language: "Which language is this ad's copy written in?",
  emotion: "Which emotion does this ad's copy mainly use?",
};

/** Keep the rubric in step with the taxonomy (tested). */
export function rubricMatchesTaxonomy(): boolean {
  return TEXT_ELEMENTS.every((key) => {
    const options = Object.keys(RUBRIC[key]).sort().join(",");
    return options === [...ELEMENTS[key]].sort().join(",");
  });
}

export function jevQuestions(): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  for (const key of TEXT_ELEMENTS) questions[key] = { type: "choice", instructions: INSTRUCTIONS[key], criteria: RUBRIC[key] };
  questions.offerPresent = {
    type: "noul",
    instructions: "Does this ad mention a concrete offer: a discount, % off, price drop, coupon code, free gift, buy-X-get-Y, or free shipping?",
  };
  questions.bigPush = {
    type: "noul",
    instructions: "Is this ad announcing something new or time-bound: a launch, a new product, a sale, or a festive campaign?",
  };
  return questions;
}

/** What Jev reads for one ad. Numbers/dates stay out: Jev does not do maths. */
export function jevState(ad: { advertiser_name: string | null; headline: string | null; primary_text: string | null; call_to_action: string | null; creative_type: string | null }) {
  const clip = (v: string | null, n: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, n) || null;
  return {
    advertiser: clip(ad.advertiser_name, 80),
    format: ad.creative_type ?? null,
    headline: clip(ad.headline, 300),
    copy: clip(ad.primary_text, 1500),
    call_to_action: clip(ad.call_to_action, 60),
  };
}

export function hasText(ad: { headline: string | null; primary_text: string | null }): boolean {
  return Boolean((ad.primary_text ?? "").trim() || (ad.headline ?? "").trim());
}

export type JevLabels = {
  elements: Decoded;
  confidence: Partial<Record<TextElement | "offerPresent", number>>;
  bigPush: number | null;
};

/** Jev answers -> taxonomy values; low-confidence labels become null. */
export function labelsFromJev(answers: Record<string, JevAnswer>, minConfidence = MIN_CONFIDENCE): JevLabels {
  const raw: Record<string, unknown> = {};
  const confidence: JevLabels["confidence"] = {};
  for (const key of TEXT_ELEMENTS) {
    const { value, confidence: c } = choiceOf(answers[key]);
    confidence[key] = Math.round(c * 100) / 100;
    raw[key] = value && c >= minConfidence ? value : null;
  }
  const offer = noulOf(answers.offerPresent);
  if (offer != null) {
    confidence.offerPresent = Math.round(Math.max(offer, 1 - offer) * 100) / 100;
    raw.offerPresent = offer >= 0.7 ? true : offer <= 0.3 ? false : null;
  }
  return { elements: normalizeDecoded(raw), confidence, bigPush: noulOf(answers.bigPush) };
}

/**
 * Gemini's full read + Jev's text labels. Visual fields, product and summary
 * always come from Gemini; a text field keeps Jev's label only when Jev was
 * very sure, otherwise Gemini's.
 */
export function mergeDecodes(gemini: Decoded, jev: JevLabels | null): Decoded {
  if (!jev) return gemini;
  const out: Decoded = { ...gemini };
  for (const key of TEXT_ELEMENTS) {
    const j = jev.elements[key];
    if (j && (jev.confidence[key] ?? 0) >= PREFER_JEV_ABOVE) (out as Record<string, unknown>)[key] = j;
    else if (!out[key] && j) (out as Record<string, unknown>)[key] = j;
  }
  if (out.offerPresent == null) out.offerPresent = jev.elements.offerPresent;
  return out;
}

/**
 * Which ads get the (paid, slower) Gemini visual read. Deterministic rules;
 * Jev's "big push" signal only adds priority. Everything else keeps Jev's
 * text labels only.
 */
export function needsVisualRead(ad: {
  watched: boolean;
  isActive: boolean | null;
  runningDays: number | null;
  hasMedia: boolean;
  bigPush: number | null;
}): boolean {
  if (!ad.hasMedia || ad.isActive === false) return false;
  if (ad.watched) return true;
  if ((ad.runningDays ?? 0) >= 7) return true;
  return (ad.bigPush ?? 0) >= 0.8;
}
