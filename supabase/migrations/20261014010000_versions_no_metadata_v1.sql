-- Slim the database (14 Oct 2026): 0.377 of 0.5 GB on the Free plan.
-- 1) New versions no longer store a copy of the creative's metadata JSON.
--    Nothing reads ad_intelligence_creative_versions.metadata (Today and the
--    history RPC use the content columns); the content hash still includes
--    it, so change detection is unchanged.
-- The one-time clean-up of existing rows is in scripts/sql/db-slim-cleanup.sql
-- (run it in small batches; one big UPDATE would drain the Disk IO budget).

CREATE OR REPLACE FUNCTION public.adspy_capture_creative_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  version_hash TEXT;
  observed_at_value TIMESTAMPTZ;
BEGIN
  version_hash := public.adspy_creative_content_hash(
    NEW.advertiser_name,
    NEW.advertiser_id,
    NEW.creator_name,
    NEW.partnership_type,
    NEW.creative_type,
    NEW.image_url,
    NEW.video_url,
    NEW.thumbnail_url,
    NEW.video_duration_seconds,
    NEW.primary_text,
    NEW.headline,
    NEW.description,
    NEW.call_to_action,
    NEW.landing_page_url,
    NEW.source_url,
    NEW.product_name,
    NEW.product_price,
    NEW.max_price,
    NEW.currency,
    NEW.offer,
    NEW.transcript,
    NEW.transcript_status,
    NEW.metadata
  );

  observed_at_value :=
    COALESCE(
      NEW.last_seen_at,
      NEW.updated_at,
      now()
    );

  INSERT INTO public.ad_intelligence_creative_versions (
    creative_id,
    content_hash,

    advertiser_name,
    advertiser_id,

    creator_name,
    partnership_type,

    creative_type,

    image_url,
    video_url,
    thumbnail_url,
    video_duration_seconds,

    primary_text,
    headline,
    description,
    call_to_action,

    landing_page_url,
    source_url,

    product_name,
    product_price,
    max_price,
    currency,

    offer,

    transcript,
    transcript_status,

    metadata,

    is_currently_active,

    first_observed_at,
    last_observed_at,
    seen_count
  )
  VALUES (
    NEW.id,
    version_hash,

    NEW.advertiser_name,
    NEW.advertiser_id,

    NEW.creator_name,
    NEW.partnership_type,

    NEW.creative_type,

    NEW.image_url,
    NEW.video_url,
    NEW.thumbnail_url,
    NEW.video_duration_seconds,

    NEW.primary_text,
    NEW.headline,
    NEW.description,
    NEW.call_to_action,

    NEW.landing_page_url,
    NEW.source_url,

    NEW.product_name,
    NEW.product_price,
    NEW.max_price,
    NEW.currency,

    NEW.offer,

    NEW.transcript,
    NEW.transcript_status,

    '{}'::jsonb, -- not read anywhere; the hash above still covers it

    NEW.is_currently_active,

    observed_at_value,
    observed_at_value,
    1
  )
  ON CONFLICT (
    creative_id,
    content_hash
  )
  DO UPDATE
  SET
    last_observed_at =
      GREATEST(
        public.ad_intelligence_creative_versions.last_observed_at,
        EXCLUDED.last_observed_at
      ),

    is_currently_active =
      EXCLUDED.is_currently_active,

    seen_count =
      public.ad_intelligence_creative_versions.seen_count + 1;

  RETURN NEW;
END;
$$;
