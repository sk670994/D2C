import type { AdProvider } from "../provider";
import type { AdPlatform } from "../types";
import { deepMetaProvider } from "./deep-meta";
import { googleProvider } from "./google";
import { linkedInProvider } from "./linkedin";

export const adProviders: Partial<Record<AdPlatform, AdProvider>> = {
  meta: deepMetaProvider,
  google: googleProvider,
  linkedin: linkedInProvider,
};
