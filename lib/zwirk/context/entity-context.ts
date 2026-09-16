import type { ZwirkEntityContext } from "./types";

export function buildAdEntityContext(ad: Record<string, unknown>): ZwirkEntityContext {
  return {
    type: "ad",
    id: typeof ad.id === "string" ? ad.id : null,
    name:
      typeof ad.advertiserName === "string"
        ? ad.advertiserName
        : null,
    payload: {
      ...ad
    }
  };
}

export function buildAdvertiserEntityContext(
  advertiser: Record<string, unknown>
): ZwirkEntityContext {
  return {
    type: "advertiser",
    id:
      typeof advertiser.id === "string"
        ? advertiser.id
        : typeof advertiser.advertiserId === "string"
          ? advertiser.advertiserId
          : null,
    name:
      typeof advertiser.name === "string"
        ? advertiser.name
        : typeof advertiser.advertiserName === "string"
          ? advertiser.advertiserName
          : null,
    payload: {
      ...advertiser
    }
  };
}

export function buildGenericEntityContext(
  type: ZwirkEntityContext["type"],
  payload: Record<string, unknown>
): ZwirkEntityContext {
  return {
    type,
    id:
      typeof payload.id === "string"
        ? payload.id
        : null,
    name:
      typeof payload.name === "string"
        ? payload.name
        : null,
    payload
  };
}
