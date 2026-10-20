/**
 * "When was this data collected?" for the public SEO pages. Pure; unit
 * tested in data-date.test.ts. Pages show the date of the data they render
 * (newest last_seen_at / summary computed_at), never the render date, and
 * flag data older than REFRESH_PENDING_HOURS.
 */
export const REFRESH_PENDING_HOURS = 36;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_OFFSET_MS = 330 * 60_000;

function parse(value: string | number | Date | null | undefined): number | null {
  if (value == null || value === "") return null;
  const t = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Newest valid timestamp of a list, as ISO; null when none is valid. */
export function newestDate(values: Array<string | null | undefined>): string | null {
  let best: number | null = null;
  for (const v of values) {
    const t = parse(v);
    if (t != null && (best == null || t > best)) best = t;
  }
  return best == null ? null : new Date(best).toISOString();
}

/** Oldest valid timestamp of a list, as ISO; null when none is valid. */
export function oldestDate(values: Array<string | null | undefined>): string | null {
  let best: number | null = null;
  for (const v of values) {
    const t = parse(v);
    if (t != null && (best == null || t < best)) best = t;
  }
  return best == null ? null : new Date(best).toISOString();
}

/** "19 Oct 2026" in India time. */
export function formatDataDate(value: string | number | Date): string {
  const t = parse(value);
  if (t == null) return "";
  const d = new Date(t + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** True when the data is older than REFRESH_PENDING_HOURS. */
export function isRefreshPending(value: string | null | undefined, now: number = Date.now(), hours = REFRESH_PENDING_HOURS): boolean {
  const t = parse(value);
  return t != null && now - t > hours * 3_600_000;
}

export type DataStamp = {
  /** "Data collected 19 Oct 2026", or "Updated 20 Oct 2026" (build date) when no data date exists. */
  text: string;
  pending: boolean;
  /** ISO date for JSON-LD dateModified. */
  iso: string;
  fromData: boolean;
};

export function dataStamp(dataDate: string | null | undefined, now: number = Date.now()): DataStamp {
  const t = parse(dataDate);
  if (t == null) {
    return { text: `Updated ${formatDataDate(now)}`, pending: false, iso: new Date(now).toISOString(), fromData: false };
  }
  return { text: `Data collected ${formatDataDate(t)}`, pending: isRefreshPending(dataDate, now), iso: new Date(t).toISOString(), fromData: true };
}
