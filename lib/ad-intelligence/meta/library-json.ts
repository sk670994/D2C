/**
 * JSON-first extraction for Meta Ad Library.
 *
 * Meta already sends every search result as structured JSON:
 *   - the first ~30 results are embedded in the page HTML, and
 *   - each further page arrives in a POST /api/graphql response while scrolling.
 * Each result lives in `search_results_connection.edges[].node.collated_results[]`
 * with ad_archive_id, page_id, page_name, is_active, start_date, end_date,
 * publisher_platform, collation info and a `snapshot` (copy, CTA, images,
 * videos, carousel cards, branded content).
 *
 * Reading that JSON is faster and far more complete than reading the rendered
 * screen. Pure string parsing — no DOM, no network — so it is unit-testable.
 */

export type MetaLibraryImage = { original_image_url?: string | null; resized_image_url?: string | null };
export type MetaLibraryVideo = {
  video_hd_url?: string | null;
  video_sd_url?: string | null;
  video_preview_image_url?: string | null;
};
export type MetaLibraryCard = {
  body?: string | null;
  title?: string | null;
  link_url?: string | null;
  link_description?: string | null;
  cta_text?: string | null;
  original_image_url?: string | null;
  resized_image_url?: string | null;
  video_hd_url?: string | null;
  video_sd_url?: string | null;
  video_preview_image_url?: string | null;
};
export type MetaLibrarySnapshot = {
  page_name?: string | null;
  page_id?: string | null;
  body?: { text?: string | null } | string | null;
  title?: string | null;
  link_url?: string | null;
  link_description?: string | null;
  caption?: string | null;
  cta_text?: string | null;
  cta_type?: string | null;
  display_format?: string | null;
  images?: MetaLibraryImage[] | null;
  videos?: MetaLibraryVideo[] | null;
  cards?: MetaLibraryCard[] | null;
  branded_content?: { page_name?: string | null; page_id?: string | null } | null;
};
export type MetaLibraryNode = {
  ad_archive_id?: string | number | null;
  page_id?: string | number | null;
  page_name?: string | null;
  is_active?: boolean | null;
  start_date?: number | null;
  end_date?: number | null;
  publisher_platform?: string[] | null;
  collation_id?: string | number | null;
  collation_count?: number | null;
  snapshot?: MetaLibrarySnapshot | null;
};

export type MetaLibraryPage = {
  nodes: MetaLibraryNode[];
  totalCount: number | null;
  endCursor: string | null;
  hasNextPage: boolean | null;
  /** Meta's "too many requests" error (code 1675004) was seen. */
  rateLimited: boolean;
};

/** Returns the index just past the JSON value that starts at `start` ('[' or '{'). */
function matchBracket(text: string, start: number): number {
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const COLLATED_KEY = '"collated_results":';

export function extractLibraryPage(text: string): MetaLibraryPage {
  const nodes: MetaLibraryNode[] = [];
  let totalCount: number | null = null;
  let endCursor: string | null = null;
  let hasNextPage: boolean | null = null;

  for (const m of text.matchAll(/"search_results_connection":\{"count":(\d+)/g)) {
    const value = Number(m[1]);
    if (Number.isFinite(value)) totalCount = Math.max(totalCount ?? 0, value);
  }
  let from = 0;
  let lastEnd = 0;
  while (from < text.length) {
    const at = text.indexOf(COLLATED_KEY, from);
    if (at < 0) break;
    const start = at + COLLATED_KEY.length;
    from = start;
    if (text[start] !== "[") continue;
    const end = matchBracket(text, start);
    if (end < 0) break;
    from = end;
    lastEnd = end;
    try {
      const arr = JSON.parse(text.slice(start, end)) as unknown;
      if (Array.isArray(arr)) {
        for (const node of arr) {
          if (node && typeof node === "object" && (node as MetaLibraryNode).ad_archive_id != null) {
            nodes.push(node as MetaLibraryNode);
          }
        }
      }
    } catch {
      // malformed chunk: skip it, the DOM fallback still runs
    }
  }

  // The results connection's page_info follows its edges, i.e. comes after the
  // last collated_results block. Reading only that one avoids unrelated
  // page_info objects elsewhere in the HTML.
  if (lastEnd > 0) {
    const infoAt = text.indexOf('"page_info":{', lastEnd);
    if (infoAt >= 0) {
      const close = text.indexOf("}", infoAt);
      const info = close > infoAt ? text.slice(infoAt, close + 1) : "";
      const cursor = info.match(/"end_cursor":"((?:[^"\\]|\\.)*)"/)?.[1];
      const next = info.match(/"has_next_page":(true|false)/)?.[1];
      if (cursor) endCursor = cursor;
      if (next) hasNextPage = next === "true";
    }
  }

  return {
    nodes,
    totalCount,
    endCursor,
    hasNextPage,
    rateLimited: /"code":\s*1675004\b|\b1675004\b/.test(text) && nodes.length === 0,
  };
}

/* ------------------------------------------------------------------ */
/* Field helpers                                                        */
/* ------------------------------------------------------------------ */

const TEMPLATE_RE = /\{\{\s*[\w.]+\s*\}\}/;

/** DCO ads carry "{{product.name}}" style placeholders at the top level. */
export function cleanCopy(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || TEMPLATE_RE.test(text)) return null;
  return text;
}

export function bodyText(snapshot: MetaLibrarySnapshot | null | undefined): string | null {
  const body = snapshot?.body;
  if (!body) return null;
  return typeof body === "string" ? body : body.text ?? null;
}

export function unixToIsoDate(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString().slice(0, 10);
}

function http(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function title(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export type NormalizedLibraryAd = {
  id: string;
  pageId: string | null;
  pageName: string | null;
  /** Creator page for partnership ads (the page that posted the ad). */
  creatorName: string | null;
  creatorPageId: string | null;
  isActive: boolean | null;
  firstSeen: string | null;
  lastSeen: string | null;
  publisherPlatforms: string[];
  collationId: string | null;
  collationCount: number | null;
  format: "image" | "video" | "carousel" | "unknown";
  displayFormat: string | null;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  callToAction: string | null;
  landingPage: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  cardCount: number;
};

/**
 * Flattens one Ad Library node into the fields Zooptrack stores.
 * The advertiser is always the top-level page_id; for partnership ads the
 * creator is kept separately so a creator is never shown as the brand.
 */
export function normalizeLibraryNode(node: MetaLibraryNode): NormalizedLibraryAd | null {
  const id = node.ad_archive_id != null ? String(node.ad_archive_id) : "";
  if (!/^\d{5,25}$/.test(id)) return null;
  const snap = node.snapshot ?? {};
  const cards = Array.isArray(snap.cards) ? snap.cards.filter(Boolean) : [];
  const firstCard = cards[0] ?? null;
  const image = Array.isArray(snap.images) ? snap.images.find(Boolean) ?? null : null;
  const video = Array.isArray(snap.videos) ? snap.videos.find(Boolean) ?? null : null;

  const videoUrl = http(video?.video_hd_url) ?? http(video?.video_sd_url) ?? http(firstCard?.video_hd_url) ?? http(firstCard?.video_sd_url);
  const imageUrl =
    http(image?.original_image_url) ?? http(image?.resized_image_url) ?? http(firstCard?.original_image_url) ?? http(firstCard?.resized_image_url);
  const thumbnailUrl = http(video?.video_preview_image_url) ?? http(firstCard?.video_preview_image_url) ?? imageUrl;

  const display = (snap.display_format ?? "").toUpperCase() || null;
  const format: NormalizedLibraryAd["format"] =
    display === "CAROUSEL" || (cards.length > 1 && display !== "DCO")
      ? "carousel"
      : videoUrl || display === "VIDEO"
        ? "video"
        : imageUrl || display === "IMAGE"
          ? "image"
          : "unknown";

  const primaryText = cleanCopy(bodyText(snap)) ?? cleanCopy(firstCard?.body);
  const headline = cleanCopy(snap.title) ?? cleanCopy(firstCard?.title);
  const description = cleanCopy(snap.link_description) ?? cleanCopy(firstCard?.link_description);
  const ctaText = cleanCopy(snap.cta_text) ?? cleanCopy(firstCard?.cta_text);
  const callToAction = ctaText ?? (snap.cta_type ? title(snap.cta_type.replace(/_/g, " ")) : null);
  const landingPage = http(snap.link_url) ?? http(firstCard?.link_url);

  // Identity (matches Meta's real structure): the top-level page_id is the
  // advertiser. For creator partnership ads the snapshot is posted by the
  // creator's page, and branded_content names the brand.
  const branded = snap.branded_content ?? null;
  const snapPageId = snap.page_id != null ? String(snap.page_id) : null;
  const pageId =
    node.page_id != null ? String(node.page_id) : branded?.page_id != null ? String(branded.page_id) : snapPageId;
  const pageName =
    (branded?.page_id != null && String(branded.page_id) === pageId ? branded.page_name : null) ??
    (snapPageId === pageId ? snap.page_name : null) ??
    node.page_name ??
    null;
  const isPartnership = Boolean(snapPageId && pageId && snapPageId !== pageId);

  const platforms = (node.publisher_platform ?? []).filter(Boolean).map((p) => title(String(p).replace(/_/g, " ")));

  return {
    id,
    pageId,
    pageName,
    creatorName: isPartnership ? snap.page_name ?? null : null,
    creatorPageId: isPartnership ? snapPageId : null,
    isActive: typeof node.is_active === "boolean" ? node.is_active : null,
    firstSeen: unixToIsoDate(node.start_date),
    lastSeen: node.is_active ? null : unixToIsoDate(node.end_date),
    publisherPlatforms: platforms,
    collationId: node.collation_id != null ? String(node.collation_id) : null,
    collationCount: typeof node.collation_count === "number" ? node.collation_count : null,
    format,
    displayFormat: display,
    primaryText,
    headline,
    description,
    callToAction,
    landingPage,
    imageUrl,
    videoUrl,
    thumbnailUrl,
    cardCount: cards.length,
  };
}
