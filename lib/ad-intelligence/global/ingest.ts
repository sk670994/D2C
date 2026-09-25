import "server-only";

import { createHash } from "node:crypto";
import type { AdPlatform, CompetitorAd } from "../types";
import { detectLanguages } from "./language";
import { extractGeography } from "./geography";
import { createGlobalServiceClient } from "./supabase";
import { isStoredMediaUrl, persistAdMedia } from "./media-store";
import { upsertAdSpyContextGraph } from "../hawky/context";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function domainOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return null; }
}

function buildExternalKey(ad: CompetitorAd): string {
  if (ad.id?.trim()) return `${ad.platform}:${ad.id.trim()}`;
  const fingerprint = [ad.platform, normalize(ad.advertiserName), normalize(ad.headline), normalize(ad.primaryText), normalize(ad.landingPage), normalize(ad.imageUrl), normalize(ad.videoUrl)].join("|");
  return `${ad.platform}:fingerprint:${createHash("sha256").update(fingerprint).digest("hex")}`;
}

function toDateOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function earliestDate(
  existing: string | null | undefined,
  candidate: string | null | undefined,
): string | null {
  const existingDate =
    toDateOrNull(existing);
  const candidateDate =
    toDateOrNull(candidate);

  if (!existingDate) {
    return candidateDate;
  }

  if (!candidateDate) {
    return existingDate;
  }

  return (
    new Date(candidateDate).getTime() <
    new Date(existingDate).getTime()
      ? candidateDate
      : existingDate
  );
}

function observationKey(input: { creativeId: string; country: string | null; region: string | null; language: string | null; publisherPlatform: string | null; day: string }): string {
  return [input.creativeId, input.day, input.country ?? "", input.region ?? "", input.language ?? "", input.publisherPlatform ?? ""].join("|");
}

export async function ingestGlobalAds(ads: CompetitorAd[]): Promise<{ insertedOrUpdated: number; observations: number; languages: number; markets: number }> {
  if (!ads.length) return { insertedOrUpdated: 0, observations: 0, languages: 0, markets: 0 };

  // Keep previews alive after Meta's CDN links expire (collector only by default).
  void upsertAdSpyContextGraph(ads.slice(0, 250)).catch((error) => {
    console.warn("[AdSpy context] graph update skipped:", error instanceof Error ? error.message : error);
  });

  await persistAdMedia(ads).catch((error) => {
    console.error("[AdSpy media] rehost skipped:", error instanceof Error ? error.message : error);
    return 0;
  });

  const client = createGlobalServiceClient();
  const now = new Date().toISOString();
  const day = now.slice(0, 10);

  const brandRowsByName = new Map<string, { canonical_name: string; normalized_name: string; domain: string | null; country: string | null }>();
  for (const ad of ads) {
    const name = (ad.advertiserName ?? "").trim();
    if (!name || name.toLowerCase() === "unknown advertiser") continue;
    const normalizedName = normalize(name);
    if (!brandRowsByName.has(normalizedName)) {
      brandRowsByName.set(normalizedName, {
        canonical_name: name,
        normalized_name: normalizedName,
        domain: domainOf(ad.landingPage),
        country: ad.country?.trim().toUpperCase() ?? null,
      });
    }
  }

  if (brandRowsByName.size) {
    const { error } = await client.from("ad_intelligence_brands").upsert(Array.from(brandRowsByName.values()), { onConflict: "normalized_name" });
    if (error) throw new Error(`Brand upsert failed: ${error.message}`);
  }

  const normalizedBrandNames = Array.from(brandRowsByName.keys());
  const { data: brandRows, error: brandLookupError } = normalizedBrandNames.length
    ? await client.from("ad_intelligence_brands").select("id,normalized_name").in("normalized_name", normalizedBrandNames)
    : { data: [], error: null };
  if (brandLookupError) throw new Error(`Brand lookup failed: ${brandLookupError.message}`);
  const brandIds = new Map<string, string>((brandRows ?? []).map((row: any) => [row.normalized_name, row.id]));

  /*
   * Preserve historical first_seen_at.
   *
   * Meta will not expose the start date on every rendered card on
   * every scrape. A later scrape must never erase a previously
   * verified first_seen_at with null.
   */
  const externalKeys = Array.from(
    new Set(
      ads.map((ad) =>
        buildExternalKey(ad),
      ),
    ),
  );

  let existingCreativeHistory: Array<{
    platform: AdPlatform;
    external_ad_key: string;
    first_seen_at: string | null;
    last_seen_at: string | null;
    advertiser_id: string | null;
    image_url: string | null;
    thumbnail_url: string | null;
  }> = [];

  if (externalKeys.length) {
    const {
      data,
      error,
    } = await client
      .from("ad_intelligence_creatives")
      .select(
        "platform,external_ad_key,first_seen_at,last_seen_at,advertiser_id,image_url,thumbnail_url",
      )
      .in(
        "external_ad_key",
        externalKeys,
      );

    if (error) {
      throw new Error(
        `Creative history lookup failed: ${error.message}`,
      );
    }

    existingCreativeHistory =
      (data ?? []) as typeof existingCreativeHistory;
  }

  const existingCreativeHistoryMap =
    new Map<
      string,
      {
        first_seen_at: string | null;
        last_seen_at: string | null;
        advertiser_id: string | null;
        image_url: string | null;
        thumbnail_url: string | null;
      }
    >(
      existingCreativeHistory.map(
        (row) => [
          `${row.platform}:${row.external_ad_key}`,
          {
            first_seen_at:
              row.first_seen_at ??
              null,
            last_seen_at:
              row.last_seen_at ??
              null,
            advertiser_id:
              row.advertiser_id ??
              null,
            image_url: row.image_url ?? null,
            thumbnail_url: row.thumbnail_url ?? null,
          },
        ],
      ),
    );

  const creativeRows = ads.map((ad) => {
    const externalAdKey =
      buildExternalKey(ad);

    const history =
      existingCreativeHistoryMap.get(
        `${ad.platform}:${externalAdKey}`,
      );

    const providerFirstSeen =
      toDateOrNull(
        ad.firstSeen,
      );

    const preservedFirstSeen =
      earliestDate(
        history?.first_seen_at ??
          null,
        providerFirstSeen,
      );

    return {

    brand_id: brandIds.get(normalize(ad.advertiserName)) ?? null,
    platform: ad.platform,
    external_ad_id: ad.id?.trim() || null,
    external_ad_key: buildExternalKey(ad),
    advertiser_name: ad.advertiserName || "Unknown advertiser",
    // A known Page ID is never erased by a later collection that lacked it.
    advertiser_id: ad.advertiserId ?? history?.advertiser_id ?? null,
    creator_name: ad.creatorName ?? null,
    partnership_type: ad.partnershipType ?? "unknown",
    creative_type: ad.creativeType ?? "unknown",
    // A stored (non-expiring) copy is never replaced by a fresh Meta CDN link.
    image_url: isStoredMediaUrl(history?.image_url) ? history!.image_url : ad.imageUrl ?? null,
    video_url: ad.videoUrl ?? null,
    thumbnail_url: isStoredMediaUrl(history?.thumbnail_url) ? history!.thumbnail_url : ad.thumbnailUrl ?? null,
    video_duration_seconds: ad.videoDurationSeconds ?? null,
    primary_text: ad.primaryText ?? null,
    headline: ad.headline ?? null,
    description: ad.description ?? null,
    call_to_action: ad.callToAction ?? null,
    landing_page_url: ad.landingPage ?? null,
    source_url: ad.sourceUrl ?? null,
    product_name: ad.productName ?? null,
    product_price: ad.productPrice ?? null,
    max_price: ad.maxPrice ?? null,
    currency: ad.currency ?? null,
    offer: ad.offer ?? null,
    transcript: ad.transcript ?? null,
    transcript_status: ad.transcriptStatus ?? "not_video",
    metadata: { ...(ad.metadata ?? {}), publisherPlatforms: ad.publisherPlatforms ?? [] },
    intelligence: ad.intelligence ?? {},
    /*
     * first_seen_at is monotonic: only an earlier verified date
     * can move it backwards. Missing provider dates never erase
     * previously stored history.
     */
    first_seen_at:
      preservedFirstSeen,

    /*
     * For an active ad, the latest observation is today. For an
     * inactive ad, retain the provider end date when available,
     * otherwise retain any previously known value.
     */
    last_seen_at:
      (ad.isActive ?? true)
        ? now
        : toDateOrNull(ad.lastSeen) ??
          history?.last_seen_at ??
          now,

    is_currently_active:
      ad.isActive ?? true,
    data_provenance: {
      advertiser: "provider",
      advertiserId:
        ad.metadata?.identitySource === "meta_graphql"
          ? "provider"
          : ad.advertiserId
            ? "requested"
            : "unavailable",
      activeStatus:
        ad.metadata?.activeStatusSource === "provider" ? "provider" : "heuristic",
      creative: "provider",
      firstSeen: ad.firstSeen ? "provider" : "unavailable",
      lastSeen: "provider",
      runningDays: "derived",
      market: (ad.metadata?.geoSource === "provider") ? "provider" : "unavailable",
      language: "heuristic",
    },
  };
  });

  const { data: upsertedCreatives, error: creativeError } = await client.from("ad_intelligence_creatives")
    .upsert(creativeRows, { onConflict: "platform,external_ad_key" })
    .select("id,platform,external_ad_key");
  if (creativeError) throw new Error(`Creative upsert failed: ${creativeError.message}`);

  const creativeIdMap = new Map<string, string>((upsertedCreatives ?? []).map((row: any) => [`${row.platform}:${row.external_ad_key}`, row.id]));

  const geoInputs = new Map<string, ReturnType<typeof extractGeography>[number]>();
  for (const ad of ads) for (const geo of extractGeography(ad)) geoInputs.set(geo.geographyKey, geo);

  if (geoInputs.size) {
    const { error } = await client.from("ad_intelligence_geographies").upsert(Array.from(geoInputs.values()).map((geo) => ({
      geography_key: geo.geographyKey,
      country_code: geo.countryCode,
      country_name: geo.countryName,
      state_name: geo.stateName,
      city_name: geo.cityName,
      region_name: geo.regionName,
      source: geo.source,
    })), { onConflict: "geography_key" });
    if (error) throw new Error(`Geography upsert failed: ${error.message}`);
  }

  const { data: geographyRows, error: geographyLookupError } = geoInputs.size
    ? await client.from("ad_intelligence_geographies").select("id,geography_key").in("geography_key", Array.from(geoInputs.keys()))
    : { data: [], error: null };
  if (geographyLookupError) throw new Error(`Geography lookup failed: ${geographyLookupError.message}`);
  const geographyIds = new Map<string, string>((geographyRows ?? []).map((row: any) => [row.geography_key, row.id]));

  const observationRows: any[] = [];
  const marketRows: any[] = [];
  const languageRows: any[] = [];
  const aliasRows: any[] = [];
  const creatorRowsToUpsert = new Map<string, any>();

  for (const ad of ads) {
    const creativeId = creativeIdMap.get(`${ad.platform}:${buildExternalKey(ad)}`);
    if (!creativeId) continue;

    const languages = detectLanguages([ad.headline, ad.primaryText, ad.description, ad.productName, ad.offer].filter(Boolean).join(" "));
    const geographies = extractGeography(ad);
    const primaryGeo = geographies[0] ?? null;
    const country = ad.country?.trim().toUpperCase() ?? primaryGeo?.countryCode ?? null;
    const region = primaryGeo?.regionName ?? null;
    const primaryLanguage = languages[0]?.code ?? null;
    const publisherPlatform = ad.publisherPlatforms?.[0] ?? null;

    observationRows.push({
      creative_id: creativeId,
      observed_at: now,
      observation_day: day,
      observation_key: observationKey({ creativeId, country, region, language: primaryLanguage, publisherPlatform, day }),
      status: ad.isActive === false ? "inactive" : ad.isActive === true ? "active" : "unknown",
      country,
      region,
      language: primaryLanguage,
      publisher_platform: publisherPlatform,
      metadata: { languages, geographies },
    });

    for (const geo of geographies) {
      const geographyId = geographyIds.get(geo.geographyKey);
      if (!geographyId) continue;
      marketRows.push({
        creative_id: creativeId,
        geography_id: geographyId,
        country: geo.countryCode,
        country_name: geo.countryName,
        state_name: geo.stateName,
        city_name: geo.cityName,
        region: geo.regionName,
        first_seen_at: toDateOrNull(ad.firstSeen) ?? now,
        last_seen_at: now,
        is_currently_active: ad.isActive ?? null,
        source: geo.source,
        confidence: geo.confidence,
      });
    }

    for (const language of languages) {
      languageRows.push({
        creative_id: creativeId,
        language_code: language.code,
        language_name: language.name,
        confidence: language.confidence,
        source: language.source,
        first_seen_at: toDateOrNull(ad.firstSeen),
        last_seen_at: now,
      });
    }

    const brandId = brandIds.get(normalize(ad.advertiserName));
    if (brandId && ad.advertiserName) aliasRows.push({ brand_id: brandId, alias: ad.advertiserName, normalized_alias: normalize(ad.advertiserName), alias_type: "advertiser" });

    if (ad.creatorName) creatorRowsToUpsert.set(`${ad.platform}:${normalize(ad.creatorName)}`, {
      canonical_name: ad.creatorName,
      normalized_name: normalize(ad.creatorName),
      platform: ad.platform,
    });
  }

  if (observationRows.length) {
    const { error } = await client.from("ad_intelligence_observations").upsert(observationRows, { onConflict: "observation_key" });
    if (error) throw new Error(`Observation upsert failed: ${error.message}`);
  }
  if (marketRows.length) {
    const { error } = await client.from("ad_intelligence_markets").upsert(marketRows, { onConflict: "creative_id,geography_id" });
    if (error) throw new Error(`Market upsert failed: ${error.message}`);
  }
  if (languageRows.length) {
    const { error } = await client.from("ad_intelligence_languages").upsert(languageRows, { onConflict: "creative_id,language_code" });
    if (error) throw new Error(`Language upsert failed: ${error.message}`);
  }
  if (aliasRows.length) {
    const { error } = await client.from("ad_intelligence_brand_aliases").upsert(aliasRows, { onConflict: "brand_id,normalized_alias" });
    if (error) console.warn("[GlobalAdIngest] Alias warning:", error.message);
  }

  if (creatorRowsToUpsert.size) {
    const { data: creators, error } =
  await client
    .from("ad_intelligence_creators")
    .upsert(
      Array.from(
        creatorRowsToUpsert.values(),
      ),
      {
        onConflict:
          "platform,normalized_name",
      },
    )
    .select(
      "id,platform,normalized_name",
    );
    if (!error && creators?.length) {
      const creatorMap = new Map(creators.map((row: any) => [`${row.platform}:${row.normalized_name}`, row.id]));
      const links: any[] = [];
      for (const ad of ads) {
        if (!ad.creatorName) continue;
        const creativeId = creativeIdMap.get(`${ad.platform}:${buildExternalKey(ad)}`);
        const creatorId = creatorMap.get(`${ad.platform}:${normalize(ad.creatorName)}`);
        if (creativeId && creatorId) links.push({ creative_id: creativeId, creator_id: creatorId, relationship_type: ad.partnershipType ?? "creator" });
      }
      if (links.length) await client.from("ad_intelligence_creative_creators").upsert(links, { onConflict: "creative_id,creator_id" });
    }
  }

  await upsertAdvertiserIndex(client, ads);

  return { insertedOrUpdated: creativeRows.length, observations: observationRows.length, languages: languageRows.length, markets: marketRows.length };
}

/**
 * Keeps the autocomplete index (ad_intelligence_advertisers) growing from
 * collected ads that carry an authoritative Page ID. Best effort: an index
 * failure must never fail the collection.
 */
async function upsertAdvertiserIndex(
  client: ReturnType<typeof createGlobalServiceClient>,
  ads: CompetitorAd[],
): Promise<void> {
  const byPage = new Map<string, CompetitorAd>();
  for (const ad of ads) {
    const pageId = ad.advertiserId?.trim();
    if (!pageId || !/^\d{5,25}$/.test(pageId)) continue;
    if (ad.metadata?.identitySource !== "meta_graphql") continue;
    const name = (ad.advertiserName ?? "").trim();
    if (!name || name.toLowerCase() === "unknown advertiser") continue;
    if (!byPage.has(`${ad.platform}:${pageId}`)) byPage.set(`${ad.platform}:${pageId}`, ad);
  }

  for (const ad of byPage.values()) {
    const profileUri =
      typeof ad.metadata?.metaPageProfileUri === "string"
        ? (ad.metadata?.metaPageProfileUri as string)
        : null;
    const { error } = await client.rpc("adspy_upsert_advertiser_v2", {
      p_platform: ad.platform,
      p_page_id: ad.advertiserId!.trim(),
      p_page_name: ad.advertiserName.trim(),
      p_normalized_name: normalize(ad.advertiserName),
      // Landing domains vary per ad (marketplaces, trackers); never overwrite a
      // curated advertiser domain with one.
      p_domain: null,
      p_profile_url: profileUri,
      p_country: ad.country?.trim().toUpperCase() ?? null,
      p_source: "meta_ad_library_collection",
      // Passing the username also pins the 16-argument overload, so
      // PostgREST never has to choose between two function signatures.
      p_facebook_username: facebookUsernameFrom(profileUri),
    });
    if (error) {
      console.warn("[GlobalAdIngest] Advertiser index warning:", error.message);
    }
  }
}

function facebookUsernameFrom(profileUri: string | null): string | null {
  if (!profileUri) return null;
  try {
    const url = new URL(profileUri);
    if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return null;
    const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!first || /^\d+$/.test(first) || first === "profile.php") return null;
    return first.slice(0, 100);
  } catch {
    return null;
  }
}
