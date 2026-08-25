import type { CompetitorAd } from "../types";

export type AdGeography = {
  geographyKey: string;
  countryCode: string;
  countryName: string | null;
  stateCode: string | null;
  stateName: string | null;
  cityCode: string | null;
  cityName: string | null;
  regionName: string | null;
  source: "provider" | "derived";
  confidence: number | null;
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v || null;
}

export function extractGeography(ad: CompetitorAd): AdGeography[] {
  const metadata = ad.metadata ?? {};
  const countryCode = String(ad.country ?? metadata.countryCode ?? "").trim().toUpperCase();
  if (!countryCode) return [];

  const countryName = text(metadata.countryName);
  const stateCode = text(metadata.stateCode);
  const stateName = text(metadata.stateName ?? metadata.state ?? metadata.province);
  const cityCode = text(metadata.cityCode);
  const cityName = text(metadata.cityName ?? metadata.city);
  const regionName = text(metadata.regionName ?? metadata.region ?? metadata.targetRegion);
  const source = metadata.geoSource === "provider" ? "provider" : "derived";
  const confidence = typeof metadata.geoConfidence === "number" ? metadata.geoConfidence : null;

  const geographyKey = [countryCode, stateCode ?? "", stateName ?? "", cityCode ?? "", cityName ?? "", regionName ?? ""].join("|");

  return [{ geographyKey, countryCode, countryName, stateCode, stateName, cityCode, cityName, regionName, source, confidence }];
}
