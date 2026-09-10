BEGIN;

ALTER TABLE public.ad_intelligence_collection_jobs
  ADD COLUMN IF NOT EXISTS user_id UUID
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS
  ad_intelligence_collection_jobs_user_idx
ON public.ad_intelligence_collection_jobs (
  user_id,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_collection_jobs_user_key_idx
ON public.ad_intelligence_collection_jobs (
  user_id,
  collection_key
);

COMMIT;