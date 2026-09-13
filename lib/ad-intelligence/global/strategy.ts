import "server-only";

import type { AdPlatform } from "../types";
import { createGlobalServiceClient } from "./supabase";

type SearchMode = "advertiser" | "keyword";

type AnalysisRow = {
  id: string;
  advertiser_name: string | null;
  creator_name: string | null;
  creative_type: string | null;
  primary_text: string | null;
  headline: string | null;
  description?: string | null;
  offer: string | null;
  call_to_action: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_currently_active: boolean | null;
};

type HistoryRow = {
  version_id: string;
  creative_id: string;
  content_hash: string;

  advertiser_name: string | null;
  advertiser_id: string | null;

  creator_name: string | null;
  partnership_type: string | null;

  creative_type: string | null;

  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;

  primary_text: string | null;
  headline: string | null;
  description: string | null;
  call_to_action: string | null;

  landing_page_url: string | null;
  source_url: string | null;

  product_name: string | null;
  product_price: number | null;
  max_price: number | null;
  currency: string | null;

  offer: string | null;
  transcript: string | null;

  is_currently_active: boolean | null;

  first_observed_at: string | null;
  last_observed_at: string | null;

  seen_count: number;
};

export type StrategySignalType =
  | "hook_shift"
  | "offer_shift"
  | "cta_shift"
  | "format_shift"
  | "messaging_shift"
  | "creative_expansion"
  | "creative_retrenchment"
  | "creative_fatigue"
  | "creator_expansion"
  | "persistence_shift";

export type StrategySignalSeverity =
  | "info"
  | "watch"
  | "important";

export type StrategySignal = {
  type: StrategySignalType;
  severity: StrategySignalSeverity;
  title: string;
  summary: string;
  evidence: string[];
  windowDays: number;
  score: number;
};

export type StrategyIntelligence = {
  state: "stable" | "evolving" | "shifting";
  confidence: "low" | "medium" | "high";
  score: number;
  signals: StrategySignal[];
  dominantBefore: string | null;
  dominantNow: string | null;
  summary: string;
  evidenceCount: number;
  windowDays: number;
  generatedAt: string;
};

const MAX_CURRENT_ROWS = 20_000;
const MAX_HISTORY_ROWS = 3_000;
const WINDOW_DAYS = 60;
const DAY_MS = 86_400_000;

function clean(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string | null | undefined): string {
  return clean(value).toLowerCase();
}

function safeDateMs(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : null;
}

function buildHook(row: {
  primary_text?: string | null;
  headline?: string | null;
}): string | null {
  const text = clean(
    row.primary_text ?? row.headline,
  );

  if (!text) {
    return null;
  }

  const firstSentence =
    text.split(/[.!?।！？]/)[0]?.trim() ?? text;

  const value = firstSentence
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return value || null;
}

function buildMessaging(row: {
  primary_text?: string | null;
  headline?: string | null;
  offer?: string | null;
}): string | null {
  const text = clean(
    [
      row.primary_text,
      row.headline,
      row.offer,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (!text) {
    return null;
  }

  const tokens = normalize(text)
    .split(/[^a-z0-9%₹$]+/)
    .filter((token) => token.length >= 3);

  const groups = [
    {
      label: "discount-led",
      keywords: [
        "discount",
        "off",
        "sale",
        "deal",
        "save",
        "%",
        "coupon",
      ],
    },
    {
      label: "problem-solution",
      keywords: [
        "problem",
        "solve",
        "fix",
        "struggle",
        "pain",
        "without",
        "stop",
      ],
    },
    {
      label: "benefit-led",
      keywords: [
        "benefit",
        "better",
        "faster",
        "easier",
        "premium",
        "quality",
        "results",
      ],
    },
    {
      label: "social-proof",
      keywords: [
        "review",
        "reviews",
        "customer",
        "customers",
        "trusted",
        "loved",
        "rated",
        "testimonial",
      ],
    },
    {
      label: "product-demo",
      keywords: [
        "watch",
        "see",
        "demo",
        "how",
        "before",
        "after",
        "works",
      ],
    },
    {
      label: "urgency-led",
      keywords: [
        "today",
        "now",
        "limited",
        "hurry",
        "ends",
        "last",
        "only",
      ],
    },
  ];

  let bestLabel: string | null = null;
  let bestScore = 0;

  for (const group of groups) {
    let score = 0;

    for (const keyword of group.keywords) {
      if (keyword === "%") {
        if (text.includes("%")) {
          score += 1;
        }
        continue;
      }

      if (tokens.includes(keyword)) {
        score += 1;
        continue;
      }

      if (
        text
          .toLowerCase()
          .includes(keyword)
      ) {
        score += 0.5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestLabel = group.label;
    }
  }

  return bestLabel;
}

function countMap(
  values: Array<string | null | undefined>,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    const key = normalize(value);

    if (!key) {
      continue;
    }

    counts.set(
      key,
      (counts.get(key) ?? 0) + 1,
    );
  }

  return counts;
}

function dominantValue(
  values: Array<string | null | undefined>,
): string | null {
  const counts = countMap(values);

  let winner: string | null = null;
  let winnerCount = 0;

  for (const [key, count] of counts) {
    if (count > winnerCount) {
      winner = key;
      winnerCount = count;
    }
  }

  return winner;
}

function share(
  numerator: number,
  denominator: number,
): number {
  if (!denominator) {
    return 0;
  }

  return numerator / denominator;
}

function clamp(
  value: number,
  min = 0,
  max = 100,
): number {
  return Math.min(
    max,
    Math.max(min, value),
  );
}

 

async function loadCurrentRows(
  input: {
    query: string;
    country: string;
    platform: AdPlatform;
    mode: SearchMode;
  },
): Promise<AnalysisRow[]> {
  const client =
    createGlobalServiceClient();

  const { data, error } =
    await client.rpc(
      "adspy_analysis_rows",
      {
        p_query:
          input.query.trim(),
        p_country:
          input.country
            .trim()
            .toUpperCase(),
        p_platform:
          input.platform,
        p_mode: input.mode,
        p_limit:
          MAX_CURRENT_ROWS,
      },
    );

  if (error) {
    throw new Error(
      `Strategy current-data query failed: ${error.message}`,
    );
  }

  return (
    (data ?? []) as unknown as AnalysisRow[]
  ).slice(0, MAX_CURRENT_ROWS);
}

async function loadHistory(
  input: {
    query: string;
    country: string;
    platform: AdPlatform;
    mode: SearchMode;
  },
): Promise<HistoryRow[]> {
  const client =
    createGlobalServiceClient();

  const { data, error } =
    await client.rpc(
      "adspy_creative_history",
      {
        p_query:
          input.query.trim(),
        p_country:
          input.country
            .trim()
            .toUpperCase(),
        p_platform:
          input.platform,
        p_mode: input.mode,
        p_limit:
          MAX_HISTORY_ROWS,
      },
    );

  if (error) {
    throw new Error(
      `Strategy history query failed: ${error.message}`,
    );
  }

  return (
    (data ?? []) as unknown as HistoryRow[]
  ).slice(0, MAX_HISTORY_ROWS);
}

function rowsInWindow<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  days: number,
): T[] {
  const cutoff =
    Date.now() - days * DAY_MS;

  return rows.filter((row) => {
    const time = safeDateMs(
      getDate(row),
    );

    return time !== null && time >= cutoff;
  });
}

function buildSignal(
  input: {
    type: StrategySignalType;
    severity: StrategySignalSeverity;
    title: string;
    summary: string;
    evidence: string[];
    score: number;
    windowDays?: number;
  },
): StrategySignal {
  return {
    ...input,
    windowDays:
      input.windowDays ??
      WINDOW_DAYS,
    score: Math.round(
      clamp(input.score),
    ),
  };
}

function analyzeCreativeExpansion(
  currentRows: AnalysisRow[],
): StrategySignal | null {
  const recent = rowsInWindow(
    currentRows,
    (row) => row.first_seen_at,
    30,
  );

  if (recent.length < 4) {
    return null;
  }

  const recentShare =
    share(recent.length, currentRows.length);

  if (recent.length < 8 && recentShare < 0.15) {
    return null;
  }

  return buildSignal({
    type: "creative_expansion",
    severity:
      recentShare >= 0.35
        ? "important"
        : "watch",
    title:
      "Creative production is expanding",
    summary:
      "A meaningful share of the indexed creative set appeared recently, suggesting an active testing or scaling phase.",
    evidence: [
      `${recent.length} creatives were first observed in the last 30 days.`,
      `${Math.round(recentShare * 100)}% of the indexed set is recent.`,
    ],
    score:
      recentShare * 100 +
      Math.min(recent.length, 20),
  });
}

function analyzeCreativeRetrenchment(
  currentRows: AnalysisRow[],
): StrategySignal | null {
  const retired = rowsInWindow(
    currentRows,
    (row) => row.last_seen_at,
    30,
  ).filter(
    (row) =>
      row.is_currently_active === false,
  );

  if (retired.length < 4) {
    return null;
  }

  const retirementShare =
    share(retired.length, currentRows.length);

  if (retirementShare < 0.1) {
    return null;
  }

  return buildSignal({
    type: "creative_retrenchment",
    severity:
      retirementShare >= 0.3
        ? "important"
        : "watch",
    title:
      "Creative output is being retrenched",
    summary:
      "A noticeable portion of the indexed set has recently become inactive, suggesting a reduction, reset, or deliberate pruning of creative.",
    evidence: [
      `${retired.length} creatives were marked inactive within the last 30 days.`,
      `${Math.round(retirementShare * 100)}% of the indexed set falls into that recently retired group.`,
    ],
    score:
      retirementShare * 120,
  });
}

function analyzeFormatShift(
  recentRows: AnalysisRow[],
  previousRows: AnalysisRow[],
): StrategySignal | null {
  if (
    recentRows.length < 5 ||
    previousRows.length < 5
  ) {
    return null;
  }

  const recentFormat =
    dominantValue(
      recentRows.map(
        (row) => row.creative_type,
      ),
    );

  const previousFormat =
    dominantValue(
      previousRows.map(
        (row) => row.creative_type,
      ),
    );

  if (
    !recentFormat ||
    !previousFormat ||
    recentFormat === previousFormat
  ) {
    return null;
  }

  const recentShare =
    share(
      recentRows.filter(
        (row) =>
          normalize(row.creative_type) ===
          recentFormat,
      ).length,
      recentRows.length,
    );

  return buildSignal({
    type: "format_shift",
    severity:
      recentShare >= 0.45
        ? "important"
        : "watch",
    title:
      "Creative format mix has shifted",
    summary:
      `The dominant creative format changed from ${previousFormat} to ${recentFormat}.`,
    evidence: [
      `Earlier window leader: ${previousFormat}.`,
      `Recent window leader: ${recentFormat}.`,
      `${Math.round(recentShare * 100)}% of recent creatives use the newer dominant format.`,
    ],
    score:
      40 +
      recentShare * 70,
  });
}

function analyzeHookShift(
  recentRows: AnalysisRow[],
  previousRows: AnalysisRow[],
): StrategySignal | null {
  if (
    recentRows.length < 5 ||
    previousRows.length < 5
  ) {
    return null;
  }

  const recentHook =
    dominantValue(
      recentRows.map(buildHook),
    );

  const previousHook =
    dominantValue(
      previousRows.map(buildHook),
    );

  if (
    !recentHook ||
    !previousHook ||
    recentHook === previousHook
  ) {
    return null;
  }

  return buildSignal({
    type: "hook_shift",
    severity: "watch",
    title:
      "Opening hook is changing",
    summary:
      "The most repeated opening message in recent creative differs from the earlier indexed window.",
    evidence: [
      `Earlier dominant hook: “${previousHook.slice(0, 90)}”.`,
      `Recent dominant hook: “${recentHook.slice(0, 90)}”.`,
    ],
    score: 55,
  });
}

function analyzeOfferShift(
  recentRows: AnalysisRow[],
  previousRows: AnalysisRow[],
): StrategySignal | null {
  if (
    recentRows.length < 5 ||
    previousRows.length < 5
  ) {
    return null;
  }

  const recentOffer =
    dominantValue(
      recentRows.map(
        (row) => row.offer,
      ),
    );

  const previousOffer =
    dominantValue(
      previousRows.map(
        (row) => row.offer,
      ),
    );

  if (
    !recentOffer ||
    !previousOffer ||
    recentOffer === previousOffer
  ) {
    return null;
  }

  return buildSignal({
    type: "offer_shift",
    severity: "watch",
    title:
      "Commercial offer has changed",
    summary:
      "The dominant offer language in recent creatives differs from the previous window.",
    evidence: [
      `Earlier offer: “${previousOffer.slice(0, 90)}”.`,
      `Recent offer: “${recentOffer.slice(0, 90)}”.`,
    ],
    score: 60,
  });
}

function analyzeCtaShift(
  recentRows: AnalysisRow[],
  previousRows: AnalysisRow[],
): StrategySignal | null {
  if (
    recentRows.length < 5 ||
    previousRows.length < 5
  ) {
    return null;
  }

  const recentCta =
    dominantValue(
      recentRows.map(
        (row) => row.call_to_action,
      ),
    );

  const previousCta =
    dominantValue(
      previousRows.map(
        (row) => row.call_to_action,
      ),
    );

  if (
    !recentCta ||
    !previousCta ||
    recentCta === previousCta
  ) {
    return null;
  }

  return buildSignal({
    type: "cta_shift",
    severity: "watch",
    title:
      "Call-to-action mix has changed",
    summary:
      "The dominant CTA in recent creatives differs from the earlier observed window.",
    evidence: [
      `Earlier CTA: “${previousCta}”.`,
      `Recent CTA: “${recentCta}”.`,
    ],
    score: 48,
  });
}

function analyzeMessagingShift(
  recentRows: AnalysisRow[],
  previousRows: AnalysisRow[],
): {
  signal: StrategySignal | null;
  recentMessaging: string | null;
  previousMessagingValue: string | null;
} {
  if (
    recentRows.length < 5 ||
    previousRows.length < 5
  ) {
    return {
      signal: null,
      recentMessaging: null,
      previousMessagingValue: null,
    };
  }

  const recentMessaging =
    dominantValue(
      recentRows.map(buildMessaging),
    );

  const previousMessagingValue =
    dominantValue(
      previousRows.map(buildMessaging),
    );

  if (
    !recentMessaging ||
    !previousMessagingValue ||
    recentMessaging ===
      previousMessagingValue
  ) {
    return {
      signal: null,
      recentMessaging,
      previousMessagingValue,
    };
  }

  const signal = buildSignal({
    type: "messaging_shift",
    severity: "important",
    title:
      "Messaging strategy is evolving",
    summary:
      `Recent creative is leaning toward ${recentMessaging.replace("-", " ")} messaging instead of the earlier ${previousMessagingValue.replace("-", " ")} pattern.`,
    evidence: [
      `Earlier dominant messaging: ${previousMessagingValue}.`,
      `Recent dominant messaging: ${recentMessaging}.`,
    ],
    score: 70,
  });

  return {
    signal,
    recentMessaging,
    previousMessagingValue,
  };
}

function analyzeCreatorExpansion(
  currentRows: AnalysisRow[],
): StrategySignal | null {
  const recent = rowsInWindow(
    currentRows,
    (row) => row.first_seen_at,
    30,
  );

  const recentCreators =
    new Set(
      recent
        .map((row) =>
          normalize(row.creator_name),
        )
        .filter(Boolean),
    );

  const historicalCreators =
    new Set(
      currentRows
        .map((row) =>
          normalize(row.creator_name),
        )
        .filter(Boolean),
    );

  if (
    recentCreators.size < 2 ||
    historicalCreators.size < 3
  ) {
    return null;
  }

  const creatorShare =
    share(
      recentCreators.size,
      historicalCreators.size,
    );

  if (creatorShare < 0.3) {
    return null;
  }

  return buildSignal({
    type: "creator_expansion",
    severity:
      creatorShare >= 0.6
        ? "important"
        : "watch",
    title:
      "Creator usage is broadening",
    summary:
      "Recent creative activity is using a broader creator set than the historical mix suggests.",
    evidence: [
      `${recentCreators.size} distinct creators appear in the recent window.`,
      `${historicalCreators.size} distinct creators are present across the indexed set.`,
    ],
    score:
      creatorShare * 90,
  });
}

function analyzeCreativeFatigue(
  currentRows: AnalysisRow[],
): StrategySignal | null {
  const persistent = currentRows.filter(
    (row) => {
      const first =
        safeDateMs(row.first_seen_at);

      const last =
        safeDateMs(row.last_seen_at) ??
        Date.now();

      if (first == null) {
        return false;
      }

      return (
        row.is_currently_active !== false &&
        last - first >= 60 * DAY_MS
      );
    },
  );

  if (persistent.length < 3) {
    return null;
  }

  const persistentShare =
    share(
      persistent.length,
      currentRows.length,
    );

  if (persistentShare < 0.15) {
    return null;
  }

  return buildSignal({
    type: "creative_fatigue",
    severity:
      persistentShare >= 0.4
        ? "watch"
        : "info",
    title:
      "Some creative is persisting unusually long",
    summary:
      "A sizable group of creatives has remained observable for 60+ days, which can indicate durable winners, slow refresh, or possible fatigue risk.",
    evidence: [
      `${persistent.length} currently active creatives have been observed for at least 60 days.`,
      `${Math.round(persistentShare * 100)}% of the indexed set is in that persistent group.`,
    ],
    score:
      persistentShare * 80,
  });
}

function analyzePersistenceShift(
  currentRows: AnalysisRow[],
): StrategySignal | null {
  const recent = rowsInWindow(
    currentRows,
    (row) => row.first_seen_at,
    30,
  );

  const previous = currentRows.filter(
    (row) => {
      const first =
        safeDateMs(row.first_seen_at);

      if (first == null) {
        return false;
      }

      const ageDays =
        (Date.now() - first) /
        DAY_MS;

      return (
        ageDays > 30 &&
        ageDays <= 90
      );
    },
  );

  if (
    recent.length < 5 ||
    previous.length < 5
  ) {
    return null;
  }

  const recentActive =
    recent.filter(
      (row) =>
        row.is_currently_active !== false,
    ).length;

  const previousActive =
    previous.filter(
      (row) =>
        row.is_currently_active !== false,
    ).length;

  const recentActiveShare =
    share(
      recentActive,
      recent.length,
    );

  const previousActiveShare =
    share(
      previousActive,
      previous.length,
    );

  const delta =
    recentActiveShare -
    previousActiveShare;

  if (Math.abs(delta) < 0.15) {
    return null;
  }

  const direction =
    delta > 0
      ? "more recent creatives are remaining active"
      : "recent creatives are being retired faster";

  return buildSignal({
    type: "persistence_shift",
    severity:
      Math.abs(delta) >= 0.3
        ? "important"
        : "watch",
    title:
      "Creative persistence is changing",
    summary:
      `Compared with the previous cohort, ${direction}.`,
    evidence: [
      `Recent cohort active share: ${Math.round(recentActiveShare * 100)}%.`,
      `Previous cohort active share: ${Math.round(previousActiveShare * 100)}%.`,
    ],
    score:
      Math.abs(delta) * 100,
  });
}

function historyToWindowRows(
  history: HistoryRow[],
): {
  recent: HistoryRow[];
  previous: HistoryRow[];
} {
  const recentCutoff =
    Date.now() - 30 * DAY_MS;

  const previousCutoff =
    Date.now() - 60 * DAY_MS;

  const olderCutoff =
    Date.now() - 90 * DAY_MS;

  const recent: HistoryRow[] = [];
  const previous: HistoryRow[] = [];

  for (const row of history) {
    const date =
      safeDateMs(row.last_observed_at) ??
      safeDateMs(row.first_observed_at);

    if (date == null) {
      continue;
    }

    if (date >= recentCutoff) {
      recent.push(row);
      continue;
    }

    if (
      date >= previousCutoff &&
      date < recentCutoff
    ) {
      previous.push(row);
      continue;
    }

    if (
      date >= olderCutoff &&
      date < previousCutoff
    ) {
      previous.push(row);
    }
  }

  return {
    recent,
    previous,
  };
}

function analyzeHistoryChanges(
  history: HistoryRow[],
): StrategySignal[] {
  if (history.length < 4) {
    return [];
  }

  const byCreative =
    new Map<string, HistoryRow[]>();

  for (const row of history) {
    const list =
      byCreative.get(
        row.creative_id,
      ) ?? [];

    list.push(row);
    byCreative.set(
      row.creative_id,
      list,
    );
  }

  let changedCreatives = 0;
  let totalCreatives = 0;
   
  let offerChanges = 0;
  let formatChanges = 0;
  let ctaChanges = 0;

  for (const versions of byCreative.values()) {
    const sorted = [...versions].sort(
      (a, b) => {
        const aTime =
          safeDateMs(
            a.first_observed_at,
          ) ?? 0;

        const bTime =
          safeDateMs(
            b.first_observed_at,
          ) ?? 0;

        return aTime - bTime;
      },
    );

    if (sorted.length < 2) {
      continue;
    }

    totalCreatives += 1;

    const first = sorted[0];
    const latest =
      sorted[sorted.length - 1];

    let changed = false;

    if (
      normalize(
        first.primary_text,
      ) !==
      normalize(
        latest.primary_text,
      ) ||
      normalize(first.headline) !==
        normalize(latest.headline)
    ) {
      
      changed = true;
    }

    if (
      normalize(first.offer) !==
      normalize(latest.offer)
    ) {
      offerChanges += 1;
      changed = true;
    }

    if (
      normalize(
        first.creative_type,
      ) !==
      normalize(
        latest.creative_type,
      )
    ) {
      formatChanges += 1;
      changed = true;
    }

    if (
      normalize(
        first.call_to_action,
      ) !==
      normalize(
        latest.call_to_action,
      )
    ) {
      ctaChanges += 1;
      changed = true;
    }

    if (changed) {
      changedCreatives += 1;
    }
  }

  if (!totalCreatives) {
    return [];
  }

  const signals: StrategySignal[] = [];

  const changedShare =
    share(
      changedCreatives,
      totalCreatives,
    );

  if (
    changedCreatives >= 3 &&
    changedShare >= 0.2
  ) {
    signals.push(
      buildSignal({
        type: "messaging_shift",
        severity:
          changedShare >= 0.5
            ? "important"
            : "watch",
        title:
          "Creative versions show active iteration",
        summary:
          "Historical snapshots show a material amount of creative editing rather than static reuse.",
        evidence: [
          `${changedCreatives} of ${totalCreatives} versioned creatives changed in text, offer, CTA, or format.`,
          `${Math.round(changedShare * 100)}% of creatives with multiple snapshots show a meaningful content change.`,
        ],
        score:
          changedShare * 100,
      }),
    );
  }

  const offerShare =
    share(
      offerChanges,
      totalCreatives,
    );

  if (
    offerChanges >= 3 &&
    offerShare >= 0.15
  ) {
    signals.push(
      buildSignal({
        type: "offer_shift",
        severity: "watch",
        title:
          "Offer experimentation is visible in history",
        summary:
          "Version history shows repeated changes to commercial offer messaging.",
        evidence: [
          `${offerChanges} versioned creatives changed their offer.`,
          `${Math.round(offerShare * 100)}% of multi-version creatives show offer changes.`,
        ],
        score:
          offerShare * 100,
      }),
    );
  }

  const formatShare =
    share(
      formatChanges,
      totalCreatives,
    );

  if (
    formatChanges >= 3 &&
    formatShare >= 0.1
  ) {
    signals.push(
      buildSignal({
        type: "format_shift",
        severity: "watch",
        title:
          "Some creatives changed format",
        summary:
          "Historical versions reveal format changes across previously observed creatives.",
        evidence: [
          `${formatChanges} creatives changed creative type across snapshots.`,
          `${Math.round(formatShare * 100)}% of multi-version creatives show format changes.`,
        ],
        score:
          formatShare * 90,
      }),
    );
  }

  const ctaShare =
    share(
      ctaChanges,
      totalCreatives,
    );

  if (
    ctaChanges >= 3 &&
    ctaShare >= 0.1
  ) {
    signals.push(
      buildSignal({
        type: "cta_shift",
        severity: "info",
        title:
          "CTA experimentation is visible",
        summary:
          "Version history contains changes to calls-to-action across multiple creatives.",
        evidence: [
          `${ctaChanges} creatives changed CTA.`,
          `${Math.round(ctaShare * 100)}% of multi-version creatives show CTA changes.`,
        ],
        score:
          ctaShare * 70,
      }),
    );
  }

  return signals;
}

function getDominantMessagingFromHistory(
  rows: HistoryRow[],
): string | null {
  return dominantValue(
    rows.map(buildMessaging),
  );
}

export async function getStrategyIntelligence(
  input: {
    query: string;
    country: string;
    platform: AdPlatform;
    mode: SearchMode;
  },
): Promise<StrategyIntelligence> {
  const [
    currentRows,
    history,
  ] = await Promise.all([
    loadCurrentRows(input),
    loadHistory(input),
  ]);

  if (
    !currentRows.length &&
    !history.length
  ) {
    return {
      state: "stable",
      confidence: "low",
      score: 0,
      signals: [],
      dominantBefore: null,
      dominantNow: null,
      summary:
        "Not enough observed creative data to infer a strategy shift yet.",
      evidenceCount: 0,
      windowDays: WINDOW_DAYS,
      generatedAt:
        new Date().toISOString(),
    };
  }

  const recentRows =
    rowsInWindow(
      currentRows,
      (row) => row.first_seen_at,
      30,
    );

  const previousRows =
    currentRows.filter(
      (row) => {
        const first =
          safeDateMs(
            row.first_seen_at,
          );

        if (first == null) {
          return false;
        }

        const ageDays =
          (Date.now() - first) /
          DAY_MS;

        return (
          ageDays > 30 &&
          ageDays <= 60
        );
      },
    );

  const signals: StrategySignal[] = [];

  const expansion =
    analyzeCreativeExpansion(
      currentRows,
    );

  if (expansion) {
    signals.push(expansion);
  }

  const retrenchment =
    analyzeCreativeRetrenchment(
      currentRows,
    );

  if (retrenchment) {
    signals.push(retrenchment);
  }

  const formatShift =
    analyzeFormatShift(
      recentRows,
      previousRows,
    );

  if (formatShift) {
    signals.push(formatShift);
  }

  const hookShift =
    analyzeHookShift(
      recentRows,
      previousRows,
    );

  if (hookShift) {
    signals.push(hookShift);
  }

  const offerShift =
    analyzeOfferShift(
      recentRows,
      previousRows,
    );

  if (offerShift) {
    signals.push(offerShift);
  }

  const ctaShift =
    analyzeCtaShift(
      recentRows,
      previousRows,
    );

  if (ctaShift) {
    signals.push(ctaShift);
  }

  const messaging =
    analyzeMessagingShift(
      recentRows,
      previousRows,
    );

  if (messaging.signal) {
    signals.push(
      messaging.signal,
    );
  }

  const creatorExpansion =
    analyzeCreatorExpansion(
      currentRows,
    );

  if (creatorExpansion) {
    signals.push(
      creatorExpansion,
    );
  }

  const fatigue =
    analyzeCreativeFatigue(
      currentRows,
    );

  if (fatigue) {
    signals.push(fatigue);
  }

  const persistence =
    analyzePersistenceShift(
      currentRows,
    );

  if (persistence) {
    signals.push(persistence);
  }

  const historySignals =
    analyzeHistoryChanges(
      history,
    );

  signals.push(
    ...historySignals,
  );

  const {
    recent: recentHistory,
    previous: previousHistory,
  } =
    historyToWindowRows(
      history,
    );

  const dominantNow =
    messaging.recentMessaging ??
    getDominantMessagingFromHistory(
      recentHistory,
    );

  const dominantBefore =
    messaging.previousMessagingValue ??
    getDominantMessagingFromHistory(
      previousHistory,
    );

  signals.sort((a, b) => {
    const severityWeight = {
      important: 3,
      watch: 2,
      info: 1,
    } as const;

    const severityDiff =
      severityWeight[
        b.severity
      ] -
      severityWeight[
        a.severity
      ];

    if (severityDiff !== 0) {
      return severityDiff;
    }

    return b.score - a.score;
  });

  const selectedSignals =
    signals.slice(0, 8);

  const weightedScore =
    selectedSignals.length
      ? selectedSignals.reduce(
          (sum, signal) =>
            sum + signal.score,
          0,
        ) /
        selectedSignals.length
      : 0;

  const importantCount =
    selectedSignals.filter(
      (signal) =>
        signal.severity ===
        "important",
    ).length;

  const watchCount =
    selectedSignals.filter(
      (signal) =>
        signal.severity ===
        "watch",
    ).length;

  const state: StrategyIntelligence["state"] =
    importantCount >= 2 ||
    weightedScore >= 70
      ? "shifting"
      : importantCount >= 1 ||
          watchCount >= 2 ||
          weightedScore >= 45
        ? "evolving"
        : "stable";

  const evidenceCount =
    currentRows.length +
    history.length;

  const confidence: StrategyIntelligence["confidence"] =
    evidenceCount >= 100 &&
    history.length >= 10
      ? "high"
      : evidenceCount >= 30 ||
          history.length >= 4
        ? "medium"
        : "low";

  let summary =
    "The observed creative strategy looks relatively stable in the current dataset.";

  if (state === "evolving") {
    summary =
      "The competitor appears to be testing or evolving its creative strategy, with several observable changes across creative production, messaging, format, or offers.";
  }

  if (state === "shifting") {
    summary =
      "The competitor appears to be undergoing a meaningful strategy shift across multiple observable creative signals.";
  }

  return {
    state,
    confidence,
    score: Math.round(
      clamp(weightedScore),
    ),
    signals: selectedSignals,
    dominantBefore,
    dominantNow,
    summary,
    evidenceCount,
    windowDays: WINDOW_DAYS,
    generatedAt:
      new Date().toISOString(),
  };
}