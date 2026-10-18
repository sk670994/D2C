/** Pure: is a page's library complete enough to tell users it's ready? (>= 90% of Meta's live count) */
export function readyEnough(collected: number, metaTotal: number | null): boolean {
  if (!metaTotal || metaTotal <= 0) return false;
  return collected / metaTotal >= 0.9;
}
