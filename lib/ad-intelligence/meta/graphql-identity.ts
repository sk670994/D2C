/**
 * Extracts authoritative advertiser identity from the JSON that Meta's
 * Ad Library embeds in its HTML and returns from /api/graphql while the
 * user scrolls.
 *
 * Each search result carries, per Library ID (ad_archive_id):
 *   - page_id           → the advertiser's Page ID (identity boundary)
 *   - is_active         → source-backed active/inactive status
 *   - collation_id/count → Meta's own grouping of near-identical creatives
 *   - page_name / page_profile_uri (when present near the page_id)
 * and the connection carries the total result count for the query.
 *
 * Pure string parsing: no DOM, no network. Safe to unit test.
 */

export type MetaAdIdentity = {
  adArchiveId: string;
  pageId: string | null;
  pageName: string | null;
  pageProfileUri: string | null;
  isActive: boolean | null;
  collationId: string | null;
  collationCount: number | null;
};

export type MetaIdentityScan = {
  ads: Map<string, MetaAdIdentity>;
  totalCount: number | null;
};

const AD_ID_RE = /"ad_archive_id":"(\d{5,25})"/g;
const MAX_WINDOW = 25_000;

function decodeJsonString(raw: string): string | null {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return null;
  }
}

function firstMatch(window: string, re: RegExp): RegExpMatchArray | null {
  re.lastIndex = 0;
  return window.match(re);
}

export function scanMetaIdentity(text: string): MetaIdentityScan {
  const ads = new Map<string, MetaAdIdentity>();
  let totalCount: number | null = null;

  const countRe = /"search_results_connection":\{"count":(\d+)/g;
  for (const m of text.matchAll(countRe)) {
    const value = Number(m[1]);
    if (Number.isFinite(value)) totalCount = Math.max(totalCount ?? 0, value);
  }

  const positions: Array<{ id: string; index: number }> = [];
  for (const m of text.matchAll(AD_ID_RE)) {
    positions.push({ id: m[1], index: m.index ?? 0 });
  }

  for (let i = 0; i < positions.length; i += 1) {
    const { id, index } = positions[i];
    const nextIndex = positions[i + 1]?.index ?? text.length;
    const end = Math.min(nextIndex, index + MAX_WINDOW);
    const window = text.slice(index, end);

    // Top-level fields appear before the nested "snapshot" object.
    const snapshotAt = window.indexOf('"snapshot":');
    const head = snapshotAt > 0 ? window.slice(0, snapshotAt) : window;

    const pageId = firstMatch(head, /"page_id":"(\d{5,25})"/)?.[1] ?? null;
    const activeRaw = firstMatch(head, /"is_active":(true|false)/)?.[1];
    const collationId = firstMatch(head, /"collation_id":"?(\d{5,25})"?/)?.[1] ?? null;
    const collationCountRaw = firstMatch(head, /"collation_count":(\d+)/)?.[1];

    let pageName: string | null = null;
    let pageProfileUri: string | null = null;

    if (pageId) {
      // Find the block that describes this page (either branded_content or
      // the snapshot itself) and read name/profile from within it.
      const marker = `"page_id":"${pageId}"`;
      let from = snapshotAt > 0 ? snapshotAt : 0;
      while (from >= 0) {
        const at = window.indexOf(marker, from);
        if (at < 0) break;
        const block = window.slice(at, at + 600);
        const name = firstMatch(block, /"page_name":"((?:[^"\\]|\\.)*)"/)?.[1];
        const uri = firstMatch(block, /"page_profile_uri":"((?:[^"\\]|\\.)*)"/)?.[1];
        if (name || uri) {
          pageName = name ? decodeJsonString(name) : null;
          pageProfileUri = uri ? decodeJsonString(uri) : null;
          break;
        }
        from = at + marker.length;
      }
    }

    const existing = ads.get(id);
    const collationCount =
      collationCountRaw != null && Number.isFinite(Number(collationCountRaw))
        ? Number(collationCountRaw)
        : null;

    ads.set(id, {
      adArchiveId: id,
      pageId: pageId ?? existing?.pageId ?? null,
      pageName: pageName ?? existing?.pageName ?? null,
      pageProfileUri: pageProfileUri ?? existing?.pageProfileUri ?? null,
      isActive:
        activeRaw === "true" ? true : activeRaw === "false" ? false : existing?.isActive ?? null,
      collationId: collationId ?? existing?.collationId ?? null,
      collationCount: collationCount ?? existing?.collationCount ?? null,
    });
  }

  return { ads, totalCount };
}

/** Merge a later scan into an accumulated one (later non-null values win). */
export function mergeMetaIdentity(into: MetaIdentityScan, next: MetaIdentityScan): MetaIdentityScan {
  for (const [id, value] of next.ads) {
    const prev = into.ads.get(id);
    into.ads.set(id, {
      adArchiveId: id,
      pageId: value.pageId ?? prev?.pageId ?? null,
      pageName: value.pageName ?? prev?.pageName ?? null,
      pageProfileUri: value.pageProfileUri ?? prev?.pageProfileUri ?? null,
      isActive: value.isActive ?? prev?.isActive ?? null,
      collationId: value.collationId ?? prev?.collationId ?? null,
      collationCount: value.collationCount ?? prev?.collationCount ?? null,
    });
  }
  if (next.totalCount != null) {
    into.totalCount = Math.max(into.totalCount ?? 0, next.totalCount);
  }
  return into;
}
