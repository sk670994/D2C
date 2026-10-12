-- Creative versions: record a version only when content or status changes.
-- The nightly "seen again" update (last_seen_at, updated_at) no longer writes
-- a version row for every unchanged ad (12 Oct: Free plan write limits).
DROP TRIGGER IF EXISTS adspy_creative_version_capture ON public.ad_intelligence_creatives;

CREATE TRIGGER adspy_creative_version_capture
AFTER INSERT OR UPDATE OF
  advertiser_name, advertiser_id, creator_name, partnership_type, creative_type,
  image_url, video_url, thumbnail_url, video_duration_seconds, primary_text,
  headline, description, call_to_action, landing_page_url, source_url,
  product_name, product_price, max_price, currency, offer, transcript,
  transcript_status, metadata, is_currently_active
ON public.ad_intelligence_creatives
FOR EACH ROW
EXECUTE FUNCTION public.adspy_capture_creative_version();
