-- Function lockdown + job hygiene. Safe to re-run.
--
-- Found 4 Oct (live check): anon could EXECUTE 14 SECURITY DEFINER functions,
-- e.g. adspy_enqueue_request / adspy_complete_request. With only the public
-- anon key, anyone could queue collections (spend credits) or close requests.
-- Every RPC in the app is called with the service role, so the browser roles
-- need none of them. Functions used inside RLS policies keep their grants.

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.prosecdef, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'   -- skip extension functions (pg_trgm etc.)
    WHERE n.nspname = 'public'
      AND d.objid IS NULL
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies pol
        WHERE (coalesce(pol.qual, '') || coalesce(pol.with_check, '')) ILIKE '%' || p.proname || '(%'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    -- Pin search_path (Supabase advisor: "function_search_path_mutable").
    IF f.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(f.proconfig) c WHERE c LIKE 'search_path=%') THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', f.sig);
    END IF;
  END LOOP;
END $$;

-- New functions start locked too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- Job hygiene: 140 "queued" jobs from August's search-as-you-type (me, mee,
-- mees...) with no run behind them. Mark every "active" job that has no live
-- run and no update for an hour as stale; a real refresh restarts it.
UPDATE public.ad_intelligence_collection_jobs j
SET status = 'stale', stage = 'stale', updated_at = now(),
    error_message = coalesce(error_message, 'Closed by cleanup: no collection was running.')
WHERE j.status IN ('queued', 'scraping', 'normalizing', 'enriching', 'finalizing', 'deep_queued', 'deep')
  AND j.updated_at < now() - interval '1 hour'
  AND NOT EXISTS (
    SELECT 1 FROM public.adspy_runs r
    WHERE r.collection_job_id = j.id AND r.status IN ('queued', 'running', 'retrying')
  );

-- Check (should return 0 rows):
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE');
