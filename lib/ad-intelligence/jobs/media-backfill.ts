import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { isStoredMediaUrl, mediaStoreEnabled, persistAdMedia, type MediaFailure } from "@/lib/ad-intelligence/global/media-store";
import type { CompetitorAd } from "@/lib/ad-intelligence/types";

type Row = { id: string; platform: string; external_ad_key: string | null; thumbnail_url: string | null; image_url: string | null };

const SELECT = "id,platform,external_ad_key,thumbnail_url,image_url";

/**
 * Candidates. With ad_intelligence_creatives.media_state (Pack C SQL), only
 * ads never tried are read, through the small partial index
 * ad_intelligence_creatives_media_pending_idx (newest-to-us first by
 * created_at, which never changes, so the index is not rewritten by the
 * nightly "seen again" update). Ads whose Meta link is gone are marked
 * 'dead' after one failed fetch and never read again; copied ads are
 * marked 'stored'. Before the SQL is applied (column missing) the old
 * 5-day window query is used unchanged.
 */
async function candidates(limit: number): Promise<{ rows: Row[]; tracked: boolean }> {
  const client = createGlobalServiceClient();
  const pending = await client
    .from("ad_intelligence_creatives")
    .select(SELECT)
    .eq("platform", "meta")
    .is("media_state", null)
    .like("thumbnail_url", "%fbcdn%")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!pending.error) return { rows: (pending.data ?? []) as Row[], tracked: true };
  if (!/42703|media_state/i.test(`${pending.error.code ?? ""} ${pending.error.message}`)) throw new Error(pending.error.message);

  const since = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const { data, error } = await client
    .from("ad_intelligence_creatives")
    .select(SELECT)
    .eq("platform", "meta")
    .gte("updated_at", since)
    .not("thumbnail_url", "is", null)
    .like("thumbnail_url", "%fbcdn%")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as Row[], tracked: false };
}

/**
 * Copies ad images into our storage after the ads are saved (idle time in the
 * drain). Collection stays fast; images still get a permanent copy before
 * Meta's signed links expire (usually a few days). Newest ads first.
 */
export async function backfillAdMedia(options: { limit?: number; deadlineAt?: number } = {}): Promise<number> {
  // Nothing can be copied: do not read (or mark) anything.
  if (!mediaStoreEnabled()) return 0;
  const client = createGlobalServiceClient();
  const { rows: found, tracked } = await candidates(Math.max(1, Math.min(options.limit ?? 60, 200)));

  const rows = found.filter((r) => !isStoredMediaUrl(r.thumbnail_url) && String(r.external_ad_key ?? "").startsWith("meta:"));
  let moved = 0;
  for (let i = 0; i < rows.length; i += 12) {
    if (options.deadlineAt && Date.now() > options.deadlineAt) break;
    const batch = rows.slice(i, i + 12);
    const ads = batch.map(
      (r) => ({ id: String(r.external_ad_key).slice(5), platform: "meta", advertiserName: "", thumbnailUrl: r.thumbnail_url, imageUrl: r.image_url }) as CompetitorAd,
    );
    const failures = new Map<CompetitorAd, MediaFailure>();
    await persistAdMedia(ads, { onFailure: (ad, reason) => failures.set(ad, reason) });
    const dead: string[] = [];
    for (let k = 0; k < batch.length; k += 1) {
      const ad = ads[k];
      if (!isStoredMediaUrl(ad.thumbnailUrl)) {
        // One failed fetch where Meta answered "gone" = dead; network or
        // storage trouble leaves the ad pending for the next pass.
        if (tracked && failures.get(ad) === "source") dead.push(batch[k].id);
        continue;
      }
      const patch: Record<string, string | null> = { thumbnail_url: ad.thumbnailUrl ?? null };
      if (isStoredMediaUrl(ad.imageUrl)) patch.image_url = ad.imageUrl ?? null;
      if (tracked) patch.media_state = "stored";
      const { error: updateError } = await client.from("ad_intelligence_creatives").update(patch).eq("id", batch[k].id);
      if (!updateError) moved += 1;
    }
    if (dead.length) {
      const { error: deadError } = await client.from("ad_intelligence_creatives").update({ media_state: "dead" }).in("id", dead);
      if (deadError) console.warn("[AdSpy media] could not mark dead links", deadError.message);
    }
  }
  return moved;
}
