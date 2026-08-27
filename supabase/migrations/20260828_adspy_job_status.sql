begin;

create or replace function public.adspy_get_collection_job(
  p_job_id uuid
)
returns table (
  id uuid,
  collection_key text,
  query text,
  country text,
  platform text,
  mode text,
  status text,
  stage text,
  discovered_ads integer,
  normalized_ads integer,
  persisted_ads integer,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  last_requested_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    j.id,
    j.collection_key,
    j.query,
    j.country,
    j.platform,
    j.mode,
    j.status,
    j.stage,
    coalesce(j.discovered_ads, 0)::integer,
    coalesce(j.normalized_ads, 0)::integer,
    coalesce(j.persisted_ads, 0)::integer,
    j.error_message,
    j.started_at,
    j.completed_at,
    j.last_requested_at,
    j.updated_at,
    j.created_at
  from public.ad_intelligence_collection_jobs j
  where j.id = p_job_id
  limit 1;
$$;

revoke all on function public.adspy_get_collection_job(uuid)
from public;

grant execute on function public.adspy_get_collection_job(uuid)
to service_role;

commit;