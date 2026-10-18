-- Bug: rate_limits_prune deleted every window older than 1 day, including
-- the trial counter (adspy-live:<uid>:trial, an 8-day window). Trial users
-- then got 3 look-ups per DAY instead of 3 in total. Keep trial counters
-- for 9 days; prune everything else after 1 day as before.
CREATE OR REPLACE FUNCTION public.rate_limits_prune() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.rate_limits
  WHERE (key LIKE '%:trial' AND window_start < now() - interval '9 days')
     OR (key NOT LIKE '%:trial' AND window_start < now() - interval '1 day');
$$;
REVOKE ALL ON FUNCTION public.rate_limits_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limits_prune() TO service_role;
