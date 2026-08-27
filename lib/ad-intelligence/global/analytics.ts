import "server-only";

import type { AdPlatform } from "../types";
import { createGlobalServiceClient } from "./supabase";

type SearchMode = "advertiser" | "keyword";

type CreativeRow = {
  id: string;
  advertiser_name: string | null;
  creator_name: string | null;
  creative_type: string | null;
  primary_text: string | null;
  headline: string | null;
  offer: string | null;
  call_to_action: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_currently_active: boolean | null;
};

export type CompetitiveAnalytics = {
  totalAds: number;
  activeAds: number;
  inactiveAds: number;
  activeShare: number;

  videoShare: number;
  imageShare: number;
  carouselShare: number;
  creatorShare: number;

  averageRunningDays: number;
  medianRunningDays: number;
  longestRunningDays: number;

  momentum: {
    newLast7Days: number;
    newLast30Days: number;
    retiredLast30Days: number;
    persistent30Days: number;
    persistent60Days: number;
    refreshRate30Days: number;
  };

  formatMix: Array<{
    label: string;
    count: number;
    share: number;
  }>;

  topCreators: Array<{
    label: string;
    count: number;
    share: number;
  }>;

  topHooks: Array<{
    label: string;
    count: number;
    share: number;
  }>;

  topOffers: Array<{
    label: string;
    count: number;
    share: number;
  }>;

  topCtas: Array<{
    label: string;
    count: number;
    share: number;
  }>;

  repetition: {
    uniqueHooks: number;
    repeatedHookAds: number;
    repeatedHookShare: number;
    uniqueOffers: number;
    repeatedOfferAds: number;
    repeatedOfferShare: number;
  };

  patternsToInvestigate: Array<{
    title: string;
    detail: string;
    evidence: string;
  }>;

  generatedAt: string;
};

const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;

function escapeLike(value: string): string {
  return value
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDateMs(
  value: string | null | undefined,
): number | null {
  if (!value) return null;

  const time = new Date(value).getTime();

  return Number.isFinite(time)
    ? time
    : null;
}

function runningDays(row: CreativeRow): number | null {
  const first = safeDateMs(row.first_seen_at);

  if (first == null) {
    return null;
  }

  const last =
    safeDateMs(row.last_seen_at) ??
    Date.now();

  return Math.max(
    1,
    Math.floor(
      (last - first) /
        86_400_000,
    ) + 1,
  );
}

function buildHook(
  row: CreativeRow,
): string | null {
  const text = clean(
    row.primary_text ??
      row.headline,
  );

  if (!text) {
    return null;
  }

  const first =
    text
      .split(
        /[.!?।！？]/,
      )[0]
      ?.trim() ?? text;

  if (!first) {
    return null;
  }

  return first
    .replace(
      /\bhttps?:\/\/\S+/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function countValues(
  values: Array<
    string | null | undefined
  >,
  total: number,
) {
  const counts =
    new Map<string, number>();

  for (const value of values) {
    const normalized =
      clean(value);

    if (!normalized) {
      continue;
    }

    counts.set(
      normalized,
      (counts.get(normalized) ?? 0) +
        1,
    );
  }

  return [...counts.entries()]
    .sort(
      (a, b) => b[1] - a[1],
    )
    .slice(0, 8)
    .map(
      ([label, count]) => ({
        label,
        count,
        share: total
          ? Math.round(
              (count / total) *
                1000,
            ) / 10
          : 0,
      }),
    );
}

function percentage(
  part: number,
  whole: number,
): number {
  return whole
    ? Math.round(
        (part / whole) * 1000,
      ) / 10
    : 0;
}

function median(
  values: number[],
): number {
  if (!values.length) {
    return 0;
  }

  const sorted = [
    ...values,
  ].sort(
    (a, b) => a - b,
  );

  const middle =
    Math.floor(
      sorted.length / 2,
    );

  if (
    sorted.length % 2
  ) {
    return sorted[middle];
  }

  return Math.round(
    (sorted[middle - 1] +
      sorted[middle]) /
      2,
  );
}

async function loadRows(
  input: {
    query: string;
    platform: AdPlatform;
    mode: SearchMode;
  },
): Promise<CreativeRow[]> {
  const client =
    createGlobalServiceClient();

  const q =
    escapeLike(
      input.query,
    );

  let base = client
    .from(
      "ad_intelligence_creatives",
    )
   .select(
  "id,advertiser_name,creator_name,creative_type,primary_text,headline,offer,call_to_action,first_seen_at,last_seen_at,is_currently_active",
  {
    count: "exact",
  },
)
    .eq(
      "platform",
      input.platform,
    );

  if (
    input.mode ===
    "advertiser"
  ) {
    base = base.ilike(
      "advertiser_name",
      `%${q}%`,
    );
  } else {
    base = base.or(
      [
        `advertiser_name.ilike.%${q}%`,
        `creator_name.ilike.%${q}%`,
        `headline.ilike.%${q}%`,
        `product_name.ilike.%${q}%`,
        `primary_text.ilike.%${q}%`,
        `description.ilike.%${q}%`,
        `offer.ilike.%${q}%`,
        `call_to_action.ilike.%${q}%`,
      ].join(","),
    );
  }

  const rows: CreativeRow[] =
    [];

  for (
    let offset = 0;
    offset < MAX_ROWS;
    offset += PAGE_SIZE
  ) {
    const {
      data,
      error,
    } = await base
      .order(
        "last_seen_at",
        {
          ascending: false,
          nullsFirst: false,
        },
      )
      .range(
        offset,
        offset +
          PAGE_SIZE -
          1,
      );

    if (error) {
      throw new Error(
        `Competitive analytics query failed: ${error.message}`,
      );
    }

const batch =
  (data ?? []) as unknown as CreativeRow[];

rows.push(...batch);

    if (
      batch.length <
        PAGE_SIZE ||
      rows.length >=
        MAX_ROWS
    ) {
      break;
    }
  }

  return rows.slice(
    0,
    MAX_ROWS,
  );
}

export async function getCompetitiveAnalytics(
  input: {
    query: string;
    platform: AdPlatform;
    mode: SearchMode;
  },
): Promise<CompetitiveAnalytics> {
  const rows =
    await loadRows(input);

  const now =
    Date.now();

  const day7 =
    now -
    7 *
      86_400_000;

  const day30 =
    now -
    30 *
      86_400_000;

  const total =
    rows.length;

  const activeRows =
    rows.filter(
      (row) =>
        row.is_currently_active !==
        false,
    );

  const running =
    rows
      .map(runningDays)
      .filter(
        (
          value,
        ): value is number =>
          value !== null &&
          Number.isFinite(
            value,
          ),
      );

  const newLast7Days =
    rows.filter(
      (row) => {
        const first =
          safeDateMs(
            row.first_seen_at,
          );

        return (
          first !== null &&
          first >= day7
        );
      },
    ).length;

  const newLast30Days =
    rows.filter(
      (row) => {
        const first =
          safeDateMs(
            row.first_seen_at,
          );

        return (
          first !== null &&
          first >= day30
        );
      },
    ).length;

  const retiredLast30Days =
    rows.filter(
      (row) => {
        const last =
          safeDateMs(
            row.last_seen_at,
          );

        return (
          row.is_currently_active ===
            false &&
          last !== null &&
          last >= day30
        );
      },
    ).length;

  const persistent30Days =
    running.filter(
      (value) =>
        value >= 30,
    ).length;

  const persistent60Days =
    running.filter(
      (value) =>
        value >= 60,
    ).length;

  const video =
    rows.filter(
      (row) =>
        row.creative_type ===
        "video",
    ).length;

  const image =
    rows.filter(
      (row) =>
        row.creative_type ===
        "image",
    ).length;

  const carousel =
    rows.filter(
      (row) =>
        row.creative_type ===
        "carousel",
    ).length;

  const creators =
    rows.filter(
      (row) =>
        Boolean(
          clean(
            row.creator_name,
          ),
        ),
    ).length;

  const hooks =
    rows.map(
      buildHook,
    );

  const offers =
    rows.map(
      (row) =>
        row.offer,
    );

  const ctas =
    rows.map(
      (row) =>
        row.call_to_action,
    );

  const creatorNames =
    rows.map(
      (row) =>
        row.creator_name,
    );

  const uniqueHooks =
    new Set(
      hooks.filter(
        Boolean,
      ),
    ).size;

  const repeatedHookCounts =
    countValues(
      hooks,
      total,
    );

  const repeatedHookAds =
    repeatedHookCounts.reduce(
      (sum, item) =>
        sum +
        (item.count > 1
          ? item.count
          : 0),
      0,
    );

  const uniqueOffers =
    new Set(
      offers
        .map(clean)
        .filter(Boolean),
    ).size;

  const repeatedOfferCounts =
    countValues(
      offers,
      total,
    );

  const repeatedOfferAds =
    repeatedOfferCounts.reduce(
      (sum, item) =>
        sum +
        (item.count > 1
          ? item.count
          : 0),
      0,
    );

  const formatMix = [
    {
      label: "Video",
      count: video,
      share: percentage(
        video,
        total,
      ),
    },
    {
      label: "Static image",
      count: image,
      share: percentage(
        image,
        total,
      ),
    },
    {
      label: "Carousel",
      count: carousel,
      share: percentage(
        carousel,
        total,
      ),
    },
  ];

  const refreshRate30Days =
    total
      ? Math.round(
          ((newLast30Days +
            retiredLast30Days) /
            total) *
            1000,
        ) / 10
      : 0;

  const patternsToInvestigate:
    CompetitiveAnalytics[
      "patternsToInvestigate"
    ] = [];

  const topHook =
    repeatedHookCounts[0];

  if (topHook) {
    patternsToInvestigate.push({
      title:
        "Repeated hook pattern",
      detail:
        `“${topHook.label}” appears repeatedly across the indexed set.`,
      evidence:
        `${topHook.count} observed creatives`,
    });
  }

  const topOffer =
    repeatedOfferCounts[0];

  if (topOffer) {
    patternsToInvestigate.push({
      title:
        "Offer repetition",
      detail:
        `“${topOffer.label}” is a recurring commercial message.`,
      evidence:
        `${topOffer.count} observed creatives`,
    });
  }

  const dominantFormat =
    [...formatMix].sort(
      (a, b) =>
        b.count - a.count,
    )[0];

  if (
    dominantFormat &&
    total
  ) {
    patternsToInvestigate.push({
      title:
        "Dominant format",
      detail:
        `${dominantFormat.label} is the most common creative format in this dataset.`,
      evidence:
        `${dominantFormat.share}% of indexed creatives`,
    });
  }

  if (
    persistent30Days >
    0
  ) {
    patternsToInvestigate.push({
      title:
        "Persistence signal",
      detail:
        "Some creatives have remained observable for 30+ days and are worth studying for messaging or format consistency.",
      evidence:
        `${persistent30Days} creatives observed for 30+ days`,
    });
  }

  if (
    newLast30Days >
    0
  ) {
    patternsToInvestigate.push({
      title:
        "Recent creative activity",
      detail:
        "A meaningful portion of the indexed set is recent, indicating an active creative refresh cycle.",
      evidence:
        `${newLast30Days} first seen in the last 30 days`,
    });
  }

  return {
    totalAds: total,
    activeAds:
      activeRows.length,
    inactiveAds:
      Math.max(
        0,
        total -
          activeRows.length,
      ),

    activeShare:
      percentage(
        activeRows.length,
        total,
      ),

    videoShare:
      percentage(
        video,
        total,
      ),

    imageShare:
      percentage(
        image,
        total,
      ),

    carouselShare:
      percentage(
        carousel,
        total,
      ),

    creatorShare:
      percentage(
        creators,
        total,
      ),

    averageRunningDays:
      running.length
        ? Math.round(
            running.reduce(
              (
                sum,
                value,
              ) =>
                sum + value,
              0,
            ) /
              running.length,
          )
        : 0,

    medianRunningDays:
      median(running),

    longestRunningDays:
      running.length
        ? Math.max(
            ...running,
          )
        : 0,

    momentum: {
      newLast7Days,
      newLast30Days,
      retiredLast30Days,
      persistent30Days,
      persistent60Days,
      refreshRate30Days,
    },

    formatMix,

    topCreators:
      countValues(
        creatorNames,
        total,
      ),

    topHooks:
      repeatedHookCounts,

    topOffers:
      repeatedOfferCounts,

    topCtas:
      countValues(
        ctas,
        total,
      ),

    repetition: {
      uniqueHooks,
      repeatedHookAds,
      repeatedHookShare:
        percentage(
          repeatedHookAds,
          total,
        ),

      uniqueOffers,
      repeatedOfferAds,
      repeatedOfferShare:
        percentage(
          repeatedOfferAds,
          total,
        ),
    },

    patternsToInvestigate:
      patternsToInvestigate.slice(
        0,
        5,
      ),

    generatedAt:
      new Date().toISOString(),
  };
}