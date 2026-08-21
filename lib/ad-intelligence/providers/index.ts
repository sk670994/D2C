import type { AdProvider } from "../provider";
import type { AdPlatform } from "../types";

import { metaProvider } from "./meta";

export const adProviders: Partial<
  Record<AdPlatform, AdProvider>
> = {
  meta: metaProvider,
};