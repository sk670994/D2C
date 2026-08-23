import type { AdProvider } from "../provider";
import type { AdPlatform } from "../types";

import { metaProvider } from "./meta";
import { googleProvider } from "./google";
import { linkedInProvider } from "./linkedin";

export const adProviders: Partial<
  Record<AdPlatform, AdProvider>
> = {
  meta: metaProvider,
  google: googleProvider,
  linkedin: linkedInProvider,
};
