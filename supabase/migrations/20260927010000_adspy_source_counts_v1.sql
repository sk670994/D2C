-- AdSpy source counts (v1)
--
-- Meta Ad Library reports its own result count for a page or keyword search.
-- The collector already reads it (metaTotalCount) but only kept it inside
-- adspy_requests.result, so the app could never say "Meta shows 412, we have
-- 398". This table keeps the latest observed Meta count per scope.
--
--   scope_type 'page'    scope_key = Meta Page ID      (exact advertiser)
--   scope_type 'keyword' scope_key = normalized keyword (keyword search)
--   status_scope 'active' = Meta's count with active_status=active (quick run)
--   status_scope 'all'    = Meta's count with active_status=all    (deep run)
--
-- Brand-name searches without a Page ID are NOT recorded: Meta runs those as
-- keyword searches, so the count covers every advertiser mentioning the word.
--
-- Additive only. Rollback: DROP TABLE public.adspy_source_counts;

BEGIN;

CREATE TABLE IF NOT EXISTS public.adspy_source_counts (
  platform TEXT NOT NULL DEFAULT 'meta',
  country TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('page', 'keyword')),
  scope_key TEXT NOT NULL CHECK (length(scope_key) BETWEEN 1 AND 200),
  status_scope TEXT NOT NULL CHECK (status_scope IN ('active', 'all')),
  meta_total INTEGER NOT NULL CHECK (meta_total >= 0),
  collected_ads INTEGER NOT NULL DEFAULT 0 CHECK (collected_ads >= 0),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, country, scope_type, scope_key, status_scope)
);

-- Server-only table: the app reads/writes it with the service role.
ALTER TABLE public.adspy_source_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adspy_source_counts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adspy_source_counts TO service_role;

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260927010000', 'adspy_source_counts_v1')
ON CONFLICT DO NOTHING;

COMMIT;
