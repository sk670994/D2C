import type { ZwirkEvidence, ZwirkEvidenceType } from "../context/types";

export function evidence(
  type: ZwirkEvidenceType,
  statement: string,
  source: ZwirkEvidence["source"]
): ZwirkEvidence {
  return {
    type,
    statement,
    source
  };
}

export function evidenceInstruction(): string {
  return `
For every material claim, internally determine whether it is:
FACT, OBSERVED, DERIVED, ASSUMPTION, or RECOMMENDATION.

Do not upgrade weaker evidence into stronger evidence.

Example:
"Running for 94 days" = OBSERVED.
"This proves the ad is profitable" = NOT SUPPORTED.
"This suggests the creative may have survived long enough to be worth studying" = DERIVED.
`;
}
