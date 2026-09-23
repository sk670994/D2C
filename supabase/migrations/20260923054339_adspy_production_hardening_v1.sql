BEGIN;

ALTER TABLE public.adspy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adspy_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS adspy_runs_user_id_idx
  ON public.adspy_runs (user_id);

CREATE INDEX IF NOT EXISTS ad_intelligence_tracked_brands_brand_id_idx
  ON public.ad_intelligence_tracked_brands (brand_id);

ALTER FUNCTION public.set_ad_intelligence_updated_at()
  SET search_path = public;

ALTER FUNCTION public.set_ad_intelligence_v2_updated_at()
  SET search_path = public;

ALTER FUNCTION public.get_ad_intelligence_rollup(text, text, text)
  SET search_path = public;

ALTER FUNCTION public.adspy_creative_content_hash(
  text, text, text, text, text, text, text, text,
  integer,
  text, text, text, text, text,
  text, text,
  numeric, numeric,
  text, text, text, text,
  jsonb
)
  SET search_path = public;

COMMIT;
