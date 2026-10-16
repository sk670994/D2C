-- Founder dashboard: database size and in-place (HOT) update counters.
-- Read-only; callable by the service role only.
create or replace function public.founder_db_stats()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'creatives_upd', coalesce(s.n_tup_upd, 0),
    'creatives_hot', coalesce(s.n_tup_hot_upd, 0),
    'creatives_dead', coalesce(s.n_dead_tup, 0),
    'last_autovacuum', s.last_autovacuum
  )
  from (select 1) one
  left join pg_stat_user_tables s
    on s.schemaname = 'public' and s.relname = 'ad_intelligence_creatives';
$$;

revoke all on function public.founder_db_stats() from public, anon, authenticated;
grant execute on function public.founder_db_stats() to service_role;
