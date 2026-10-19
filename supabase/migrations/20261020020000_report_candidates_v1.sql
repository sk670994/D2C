-- Rival report candidates: distinct users who track at least one rival.
-- Replaces two up-to-20,000-row reads per report tick (every 15 min) with one
-- small DISTINCT list computed in Postgres (both tables are indexed on user_id).
-- SECURITY INVOKER (default): only service_role may call it, and service_role
-- already bypasses RLS on both tables.
CREATE OR REPLACE FUNCTION public.report_candidate_user_ids()
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT w.user_id FROM public.adspy_advertiser_watchlists w WHERE w.platform = 'meta'
  UNION
  SELECT c.user_id FROM public.brand_vault_competitors c WHERE c.user_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.report_candidate_user_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_candidate_user_ids() TO service_role;
