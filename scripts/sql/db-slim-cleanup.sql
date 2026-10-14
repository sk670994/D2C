-- One-time database clean-up (14 Oct 2026). Run in the Supabase SQL Editor,
-- ONE STEP AT A TIME, when the Disk IO banner is gone (evening is best, not
-- while the 1 AM collection runs).

-- STEP 0: measure (before and after)
select relname as table_name,
       pg_size_pretty(pg_total_relation_size(relid)) as total,
       n_live_tup as rows
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 6;

-- STEP 1: empty the unused metadata copy on old versions, 3,000 rows a run.
-- Click Run again until it says "0 rows affected" (about 11 runs).
update public.ad_intelligence_creative_versions
set metadata = '{}'::jsonb
where id in (
  select id from public.ad_intelligence_creative_versions
  where metadata <> '{}'::jsonb
  limit 3000
);

-- STEP 2: same for daily observations (languages/geographies are kept in
-- their own tables). Click Run until "0 rows affected" (about 18 runs).
update public.ad_intelligence_observations
set metadata = '{}'::jsonb
where id in (
  select id from public.ad_intelligence_observations
  where metadata <> '{}'::jsonb
  limit 3000
);

-- STEP 3: give the freed space back (a few seconds each; run separately).
vacuum full public.ad_intelligence_creative_versions;
vacuum full public.ad_intelligence_observations;

-- STEP 4: measure again with STEP 0.
