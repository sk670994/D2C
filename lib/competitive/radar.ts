export type RadarAd = {
  id: string;
  advertiserName?: string | null;
  offer?: string | null;
  headline?: string | null;
  primaryText?: string | null;
  creativeType?: string | null;
};

export type CompetitiveRadar = {
  newAds: RadarAd[];
  removedAds: RadarAd[];
  newOffers: string[];
  removedOffers: string[];
  newHooks: string[];
  removedHooks: string[];
  formatMixChange: Record<string, number>;
};

function normalized(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function hook(ad: RadarAd) {
  return (ad.primaryText || ad.headline || "").split(/[.!?\u0964\u0965]/)[0]?.trim() ?? "";
}

export function compareCompetitiveSnapshots(
  previous: RadarAd[],
  current: RadarAd[],
): CompetitiveRadar {
  const previousById = new Map(previous.map((ad) => [ad.id, ad]));
  const currentById = new Map(current.map((ad) => [ad.id, ad]));

  const previousOffers = new Set(previous.map((ad) => normalized(ad.offer)).filter(Boolean));
  const currentOffers = new Set(current.map((ad) => normalized(ad.offer)).filter(Boolean));
  const previousHooks = new Set(previous.map((ad) => normalized(hook(ad))).filter(Boolean));
  const currentHooks = new Set(current.map((ad) => normalized(hook(ad))).filter(Boolean));

  const newAds = current.filter((ad) => !previousById.has(ad.id));
  const removedAds = previous.filter((ad) => !currentById.has(ad.id));
  const formatMixChange: Record<string, number> = {};

  for (const ad of [...previous, ...current]) {
    const type = normalized(ad.creativeType) || "unknown";
    if (!(type in formatMixChange)) formatMixChange[type] = 0;
    formatMixChange[type] += currentById.has(ad.id) ? 1 : -1;
  }

  return {
    newAds,
    removedAds,
    newOffers: unique([...currentOffers].filter((value) => !previousOffers.has(value))),
    removedOffers: unique([...previousOffers].filter((value) => !currentOffers.has(value))),
    newHooks: unique([...currentHooks].filter((value) => !previousHooks.has(value))),
    removedHooks: unique([...previousHooks].filter((value) => !currentHooks.has(value))),
    formatMixChange,
  };
}
