import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { isStoredMediaUrl, persistAdMedia } from "@/lib/ad-intelligence/global/media-store";
import type { CompetitorAd } from "@/lib/ad-intelligence/types";

/**
 * Copies ad images into our storage after the ads are saved (idle time in the
 * drain). Collection stays fast; images still get a permanent copy before
 * Meta's signed links expire (usually a few days). Newest ads first.
 */
export async function backfillAdMedia(options: { limit?: number; deadlineAt?: number } = {}): Promise<number> {
  const client = createGlobalServiceClient();
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const { data, error } = await client
    .from("ad_intelligence_creatives")
    .select("id,platform,external_ad_key,thumbnail_url,image_url")
    .eq("platform", "meta")
    .gte("updated_at", since)
    .not("thumbnail_url", "is", null)
    .like("thumbnail_url", "%fbcdn%")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(options.limit ?? 60, 200)));
  if (error) throw new Error(error.message);

  type Row = { id: string; platform: string; external_ad_key: string | null; thumbnail_url: string | null; image_url: string | null };
  const rows = ((data ?? []) as Row[]).filter((r) => !isStoredMediaUrl(r.thumbnail_url) && String(r.external_ad_key ?? "").startsWith("meta:"));
  let moved = 0;
  for (let i = 0; i < rows.length; i += 12) {
    if (options.deadlineAt && Date.now() > options.deadlineAt) break;
    const batch = rows.slice(i, i + 12);
    const ads = batch.map(
      (r) => ({ id: String(r.external_ad_key).slice(5), platform: "meta", advertiserName: "", thumbnailUrl: r.thumbnail_url, imageUrl: r.image_url }) as CompetitorAd,
    );
    await persistAdMedia(ads);
    for (let k = 0; k < batch.length; k += 1) {
      const ad = ads[k];
      if (!isStoredMediaUrl(ad.thumbnailUrl)) continue;
      const patch: Record<string, string | null> = { thumbnail_url: ad.thumbnailUrl ?? null };
      if (isStoredMediaUrl(ad.imageUrl)) patch.image_url = ad.imageUrl ?? null;
      const { error: updateError } = await client.from("ad_intelligence_creatives").update(patch).eq("id", batch[k].id);
      if (!updateError) moved += 1;
    }
  }
  return moved;
}
