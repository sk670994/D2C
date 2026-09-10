-- Each source ad needs a separate daily metrics row. The legacy campaign/day
-- constraint collapsed sibling ads into one record during upserts.
ALTER TABLE public.ad_metrics
  DROP CONSTRAINT IF EXISTS ad_metrics_user_id_platform_campaign_id_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_metrics_unique_ad_date
  ON public.ad_metrics (user_id, platform, ad_id, date);
