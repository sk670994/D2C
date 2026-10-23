/** Conservative name/domain matching for advertiser autocomplete. */
function normalizeMatchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRelevantAdvertiserMatch(
  query: string,
  label: string,
  domain?: string | null,
): boolean {
  const q = normalizeMatchText(query);
  if (!q) return false;

  const name = normalizeMatchText(label);
  const cleanedDomain = (domain ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  const username = normalizeMatchText(cleanedDomain);

  return Boolean(
    name === q ||
    name.startsWith(q) ||
    name.includes(q) ||
    username === q ||
    username.startsWith(q) ||
    username.includes(q)
  );
}
