-- Shared cache for per-brand summaries (Today, brand pages, reports).
-- One row per brand; recomputed at most every 15 minutes. Service role only.
-- Rollback: DROP TABLE public.today_cache;

BEGIN;

CREATE TABLE IF NOT EXISTS public.today_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.today_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.today_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.today_cache TO service_role;

-- The per-brand read behind every summary: newest ads of one page.
CREATE INDEX IF NOT EXISTS ad_intelligence_creatives_meta_page_first_seen_idx
  ON public.ad_intelligence_creatives (advertiser_id, first_seen_at DESC NULLS LAST, id)
  WHERE platform = 'meta';

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260930010000', 'today_cache_v1')
ON CONFLICT DO NOTHING;

COMMIT;
