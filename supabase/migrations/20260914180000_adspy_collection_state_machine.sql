BEGIN;

-- Extend the collection lifecycle without changing existing rows.
ALTER TABLE public.ad_intelligence_collection_jobs
  DROP CONSTRAINT IF EXISTS ad_intelligence_collection_jobs_status_check;

ALTER TABLE public.ad_intelligence_collection_jobs
  ADD CONSTRAINT ad_intelligence_collection_jobs_status_check
  CHECK (
    status IN (
      'queued',
      'scraping',
      'normalizing',
      'enriching',
      'finalizing',
      'deep_queued',
      'deep',
      'exhausted',
      'stale',
      'cancelled',
      'complete',
      'failed'
    )
  );

ALTER TABLE public.ad_intelligence_collection_jobs
  DROP CONSTRAINT IF EXISTS ad_intelligence_collection_jobs_stage_check;

ALTER TABLE public.ad_intelligence_collection_jobs
  ADD CONSTRAINT ad_intelligence_collection_jobs_stage_check
  CHECK (
    stage IN (
      'queued',
      'scraping',
      'normalizing',
      'enriching',
      'finalizing',
      'deep_queued',
      'deep',
      'exhausted',
      'stale',
      'cancelled',
      'complete',
      'failed'
    )
  );

CREATE INDEX IF NOT EXISTS ad_intelligence_collection_jobs_heartbeat_idx
  ON public.ad_intelligence_collection_jobs (status, updated_at DESC)
  WHERE status IN (
    'queued',
    'scraping',
    'normalizing',
    'enriching',
    'finalizing',
    'deep_queued',
    'deep'
  );

CREATE OR REPLACE FUNCTION public.adspy_get_collection_job(
  p_job_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  collection_key TEXT,
  query TEXT,
  country TEXT,
  platform TEXT,
  mode TEXT,
  status TEXT,
  stage TEXT,
  discovered_ads INTEGER,
  normalized_ads INTEGER,
  persisted_ads INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_requested_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT
    j.id,
    j.collection_key,
    j.query,
    j.country,
    j.platform,
    j.mode,
    j.status,
    j.stage,
    COALESCE(j.discovered_ads, 0)::INTEGER,
    COALESCE(j.normalized_ads, 0)::INTEGER,
    COALESCE(j.persisted_ads, 0)::INTEGER,
    j.error_message,
    j.started_at,
    j.completed_at,
    j.last_requested_at,
    j.updated_at,
    j.created_at
  FROM public.ad_intelligence_collection_jobs j
  WHERE j.id = p_job_id
    AND j.user_id = p_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.adspy_get_collection_job(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_get_collection_job(UUID, UUID) TO service_role;

COMMIT;
