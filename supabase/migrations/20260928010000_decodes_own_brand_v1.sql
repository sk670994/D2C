-- AI creative labels + "your brand" (v1)
--
-- ad_creative_decodes: one row per ad labelled by the AI decoder
--   (hook type, angle, persona, visual style, language, emotion ...).
--   Written by the worker / cron with the service role only.
-- brand_vaults.own_page_id: the user's own Meta page, for "Vs you".
--
-- Additive only. Rollback:
--   DROP TABLE public.ad_creative_decodes;
--   ALTER TABLE public.brand_vaults DROP COLUMN own_page_id;

BEGIN;

CREATE TABLE IF NOT EXISTS public.ad_creative_decodes (
  creative_id UUID PRIMARY KEY REFERENCES public.ad_intelligence_creatives(id) ON DELETE CASCADE,
  advertiser_id TEXT,
  model TEXT NOT NULL,
  taxonomy_version SMALLINT NOT NULL,
  elements JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('done', 'failed')),
  error TEXT,
  decoded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_creative_decodes_advertiser_idx
  ON public.ad_creative_decodes (advertiser_id, decoded_at DESC);

ALTER TABLE public.ad_creative_decodes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_creative_decodes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_creative_decodes TO service_role;

ALTER TABLE public.brand_vaults
  ADD COLUMN IF NOT EXISTS own_page_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brand_vaults_own_page_id_digits'
  ) THEN
    ALTER TABLE public.brand_vaults
      ADD CONSTRAINT brand_vaults_own_page_id_digits CHECK (own_page_id IS NULL OR own_page_id ~ '^[0-9]+$');
  END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260928010000', 'decodes_own_brand_v1')
ON CONFLICT DO NOTHING;

COMMIT;
