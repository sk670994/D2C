-- Least privilege for the browser roles (anon = signed-out visitor,
-- authenticated = signed-in user). The app's server uses the service role,
-- which is not affected. RLS still guards what remains.
-- Safe to run more than once.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    -- TRUNCATE bypasses row level security: no browser role may ever have it.
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated', t.tablename);
    -- Signed-out visitors never write anything.
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t.tablename);

    -- Pipeline, billing and ops tables: server only (no browser access at all).
    IF t.tablename IN (
      'adspy_requests', 'adspy_runs', 'adspy_workers', 'ai_calls', 'ops_alerts',
      'alert_deliveries', 'billing_events', 'today_cache', 'landing_pages',
      'ad_landing_checks', 'ad_intelligence_creative_versions_backup_20260925'
    ) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.tablename);
    END IF;

    -- Shared ad data and plans: users read through the app, never write.
    IF t.tablename LIKE 'ad_intelligence\_%' ESCAPE '\'
       OR (t.tablename LIKE 'adspy\_%' ESCAPE '\' AND t.tablename <> 'adspy_advertiser_watchlists')
       OR t.tablename IN ('ad_creative_decodes', 'billing_subscriptions')
    THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t.tablename);
    END IF;
  END LOOP;
END $$;

-- Views and sequences: no writes from the browser roles.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Tables created later get the same defaults.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;

-- Check afterwards (should return no rows):
-- select table_name, grantee, privilege_type from information_schema.role_table_grants
-- where table_schema = 'public' and grantee in ('anon','authenticated')
--   and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES');
