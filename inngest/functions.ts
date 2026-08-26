import {
  collectAdIntelligence,
} from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";

import {
  refreshTrackedAdSpy,
} from "@/lib/ad-intelligence/jobs/refresh-tracked-ad-spy";

export const functions = [
  collectAdIntelligence,
  refreshTrackedAdSpy,
];
