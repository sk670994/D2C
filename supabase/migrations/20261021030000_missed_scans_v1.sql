-- Pack D: collector correctness (v1)
--
-- 19 Oct: Kapiva (3 pages, ~1,300 live ads) was read to 1,178 ads, the scan
-- called itself complete, and 583 live ads were marked stopped at once.
--
-- 1. ad_intelligence_creatives.missed_scans: an ad must be missing from TWO
--    complete scans in a row before it is marked stopped ("two strikes").
--    ADD COLUMN with a constant default is metadata-only on PG 11+ (no table
--    rewrite, no long lock on the big table).
-- 2. adspy_mark_missed(): one call per complete scan of a page. Seen ads with
--    a strike are reset (only rows with missed_scans > 0 are written), missed
--    live ads get a strike, second strike = stopped. Refuses to touch
--    anything when more than 15% of the page's live ads are missing (a bad
--    scan, not real churn). Stopping still sets is_currently_active = false,
--    so the version trigger records the stop exactly as before; strike-only
--    updates do not touch is_currently_active and write no version row.
-- 3. adspy_source_counts.complete / stopped_by: how the last scan ended.
-- 4. adspy_unresolved_brands: seed brands the collector could not match to a
--    Meta page (for the founder page later).
--
-- Additive only. Rollback:
--   DROP FUNCTION IF EXISTS public.adspy_mark_missed(text, text, timestamptz, numeric, integer, integer);
--   DROP TABLE IF EXISTS public.adspy_unresolved_brands;
--   ALTER TABLE public.adspy_source_counts DROP COLUMN IF EXISTS complete, DROP COLUMN IF EXISTS stopped_by;
--   ALTER TABLE public.ad_intelligence_creatives DROP COLUMN IF EXISTS missed_scans;

BEGIN;

-- Fail fast instead of queueing behind a long nightly write.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.ad_intelligence_creatives
  ADD COLUMN IF NOT EXISTS missed_scans smallint NOT NULL DEFAULT 0;

ALTER TABLE public.adspy_source_counts
  ADD COLUMN IF NOT EXISTS complete boolean,
  ADD COLUMN IF NOT EXISTS stopped_by text;

CREATE TABLE IF NOT EXISTS public.adspy_unresolved_brands (
  name text PRIMARY KEY CHECK (length(name) BETWEEN 1 AND 200),
  reason text,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.adspy_unresolved_brands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adspy_unresolved_brands FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adspy_unresolved_brands TO service_role;

CREATE OR REPLACE FUNCTION public.adspy_mark_missed(
  p_platform text,
  p_page_id text,
  p_scan_started_at timestamptz,
  p_max_share numeric DEFAULT 0.15,
  p_floor integer DEFAULT 5,
  p_strikes integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_reset integer := 0;
  v_live integer := 0;
  v_missed integer := 0;
  v_struck integer := 0;
  v_stopped uuid[] := '{}';
  v_now timestamptz := now();
begin
  if coalesce(p_page_id, '') = '' or p_scan_started_at is null then
    raise exception 'adspy_mark_missed: page id and scan start are required';
  end if;

  -- Seen in this scan (last_seen_at written during the scan): clear strikes.
  -- Only rows that carry a strike are written, not every seen ad.
  update public.ad_intelligence_creatives
  set missed_scans = 0
  where platform = p_platform
    and advertiser_id = p_page_id
    and missed_scans > 0
    and last_seen_at >= p_scan_started_at;
  get diagnostics v_reset = row_count;

  select count(*)::int,
         count(*) filter (where last_seen_at < p_scan_started_at)::int
    into v_live, v_missed
  from public.ad_intelligence_creatives
  where platform = p_platform
    and advertiser_id = p_page_id
    and is_currently_active = true;

  if v_missed = 0 then
    return jsonb_build_object('live', v_live, 'missed', 0, 'struck', 0, 'stopped', 0, 'reset', v_reset, 'capped', false);
  end if;

  -- Sanity cap: a big share "missing" at once is a bad scan, not churn.
  if v_missed > greatest(p_floor, 0) and v_missed > coalesce(p_max_share, 0.15) * v_live then
    return jsonb_build_object('live', v_live, 'missed', v_missed, 'struck', 0, 'stopped', 0, 'reset', v_reset, 'capped', true);
  end if;

  -- Last strike: stop. Sets is_currently_active, so the version trigger
  -- records the stop as before.
  with stopped as (
    update public.ad_intelligence_creatives
    set missed_scans = least(missed_scans + 1, 32000),
        is_currently_active = false,
        updated_at = v_now
    where platform = p_platform
      and advertiser_id = p_page_id
      and is_currently_active = true
      and last_seen_at < p_scan_started_at
      and missed_scans + 1 >= greatest(p_strikes, 1)
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_stopped from stopped;

  -- Earlier strikes: count only. is_currently_active is not in the SET list,
  -- so no version row is written.
  update public.ad_intelligence_creatives
  set missed_scans = least(missed_scans + 1, 32000)
  where platform = p_platform
    and advertiser_id = p_page_id
    and is_currently_active = true
    and last_seen_at < p_scan_started_at;
  get diagnostics v_struck = row_count;

  -- Market rows carry their own live flag (state / city views).
  if cardinality(v_stopped) > 0 then
    update public.ad_intelligence_markets
    set is_currently_active = false
    where creative_id = any(v_stopped)
      and is_currently_active is distinct from false;
  end if;

  return jsonb_build_object(
    'live', v_live,
    'missed', v_missed,
    'struck', v_struck,
    'stopped', cardinality(v_stopped),
    'reset', v_reset,
    'capped', false
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.adspy_mark_missed(text, text, timestamptz, numeric, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adspy_mark_missed(text, text, timestamptz, numeric, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adspy_mark_missed(text, text, timestamptz, numeric, integer, integer) TO service_role;

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20261021010000', 'missed_scans_v1')
ON CONFLICT DO NOTHING;

COMMIT;

-- PostgREST picks up the new function without a restart.
NOTIFY pgrst, 'reload schema';
