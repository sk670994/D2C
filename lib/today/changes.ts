/**
 * "What changed": a live ad whose offer, price, CTA, headline, copy or landing
 * page changed. Built from ad_intelligence_creative_versions (a new version is
 * stored by a trigger only when the advertiser-authored content hash changes).
 * Pure; unit tested in changes.test.ts.
 *
 * Noise rules: a field going from empty to filled is not a change (a richer
 * scrape, not the advertiser); copy must really differ (word overlap < 75%),
 * not just whitespace or punctuation; landing pages compare without query
 * strings (tracking parameters rotate).
 */

export type VersionRow = {
  creative_id: string;
  primary_text: string | null;
  headline: string | null;
  call_to_action: string | null;
  landing_page_url: string | null;
  offer: string | null;
  product_price: number | string | null;
  currency: string | null;
  first_observed_at: string;
};

export type ChangeKind = "offer" | "price" | "cta" | "headline" | "copy" | "landing";

export type AdChange = {
  creativeId: string;
  kind: ChangeKind;
  before: string;
  after: string;
  at: string;
};

/** Offer and price changes matter most to a rival's buyer. */
export const CHANGE_WEIGHT: Record<ChangeKind, number> = { offer: 60, price: 55, cta: 25, headline: 20, landing: 20, copy: 15 };

const text = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const key = (v: unknown) => text(v).toLowerCase().replace(/[^\p{L}\p{N}%₹]+/gu, " ").trim();
const words = (v: unknown) => new Set(key(v).split(" ").filter((w) => w.length > 1));

/** Share of words the two texts have in common (Jaccard). */
export function wordOverlap(a: unknown, b: unknown): number {
  const A = words(a);
  const B = words(b);
  if (!A.size && !B.size) return 1;
  let common = 0;
  for (const w of A) if (B.has(w)) common += 1;
  return common / (A.size + B.size - common);
}

function landingKey(url: unknown): string {
  const raw = text(url).toLowerCase();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return raw.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function price(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const clip = (v: string, n = 90) => (v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v);

/** Differences between two versions of one ad (older -> newer). */
export function diffVersions(prev: VersionRow, next: VersionRow): AdChange[] {
  const out: AdChange[] = [];
  const add = (kind: ChangeKind, before: string, after: string) =>
    out.push({ creativeId: next.creative_id, kind, before: clip(before), after: clip(after), at: next.first_observed_at });

  if (key(prev.offer) && key(next.offer) && key(prev.offer) !== key(next.offer)) add("offer", text(prev.offer), text(next.offer));

  const p0 = price(prev.product_price);
  const p1 = price(next.product_price);
  if (p0 != null && p1 != null && Math.abs(p0 - p1) >= 1) {
    const cur = text(next.currency) === "INR" || !text(next.currency) ? "₹" : `${text(next.currency)} `;
    add("price", `${cur}${p0}`, `${cur}${p1}`);
  }

  if (key(prev.call_to_action) && key(next.call_to_action) && key(prev.call_to_action) !== key(next.call_to_action)) {
    add("cta", text(prev.call_to_action), text(next.call_to_action));
  }
  if (key(prev.headline) && key(next.headline) && wordOverlap(prev.headline, next.headline) < 0.75) add("headline", text(prev.headline), text(next.headline));

  const l0 = landingKey(prev.landing_page_url);
  const l1 = landingKey(next.landing_page_url);
  if (l0 && l1 && l0 !== l1) add("landing", l0, l1);

  // Copy only when nothing more specific explains the change.
  if (!out.length && key(prev.primary_text) && key(next.primary_text) && wordOverlap(prev.primary_text, next.primary_text) < 0.75) {
    add("copy", text(prev.primary_text), text(next.primary_text));
  }
  return out;
}

/**
 * Changes observed since `sinceMs`, most important first, one per ad and
 * kind. `versions` may hold every version of several ads in any order.
 */
export function detectChanges(versions: VersionRow[], sinceMs: number): AdChange[] {
  const byAd = new Map<string, VersionRow[]>();
  for (const v of versions) {
    const list = byAd.get(v.creative_id) ?? [];
    list.push(v);
    byAd.set(v.creative_id, list);
  }
  const out: AdChange[] = [];
  for (const list of byAd.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => Date.parse(a.first_observed_at) - Date.parse(b.first_observed_at));
    const seen = new Set<string>();
    for (let i = list.length - 1; i >= 1; i -= 1) {
      if (Date.parse(list[i].first_observed_at) < sinceMs) break;
      for (const change of diffVersions(list[i - 1], list[i])) {
        const k = `${change.creativeId}:${change.kind}`;
        if (seen.has(k)) continue; // keep the latest change of each kind
        seen.add(k);
        out.push(change);
      }
    }
  }
  return out.sort((a, b) => CHANGE_WEIGHT[b.kind] - CHANGE_WEIGHT[a.kind] || Date.parse(b.at) - Date.parse(a.at));
}

const WHAT: Record<ChangeKind, string> = {
  offer: "changed an offer",
  price: "changed a price",
  cta: "changed a call to action",
  headline: "rewrote a headline",
  landing: "pointed an ad at a new page",
  copy: "rewrote an ad",
};

export function changeTitle(change: AdChange): string {
  if (change.kind === "copy") return "Rewrote a live ad's copy.";
  return `${WHAT[change.kind].charAt(0).toUpperCase()}${WHAT[change.kind].slice(1)}: “${change.before}” → “${change.after}”.`;
}
