-- Pack C / c2: index cleanup + media/notify indexes. Lossless.
--
-- RUN EACH STATEMENT ON ITS OWN (select one statement in the SQL editor and
-- run it, then the next). CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and the SQL editor wraps a multi-statement run in one.
-- Do NOT `supabase db push` this file.
-- Run the c1 file (20261021010000_pack_c_io_c1_functions.sql) first.
--
-- CHECK SIZES FIRST with the query below (read-only). Expect the "drop" rows
-- to exist and the "keep" partner rows to exist; idx_scan = how often the
-- planner used each index since the last stats reset. Anything already gone
-- (e.g. dropped by the 16 Oct phase-1 cleanup) is simply skipped: every DROP
-- is IF EXISTS / guarded, every CREATE is IF NOT EXISTS.
--
--   SELECT s.relname AS table_name, s.indexrelname AS index_name,
--          pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
--          s.idx_scan, pg_get_indexdef(s.indexrelid) AS definition
--   FROM pg_stat_user_indexes s
--   WHERE s.schemaname = 'public'
--     AND s.relname IN ('ad_intelligence_creatives', 'ad_intelligence_creative_versions',
--                       'ad_intelligence_markets', 'ad_intelligence_collection_jobs')
--   ORDER BY s.relname, pg_relation_size(s.indexrelid) DESC;
--
-- Free disk is ~75 MB: the CREATEs below are all small (partial / BRIN), and
-- the drops free space first. Run them in this order.
--
-- If a CONCURRENTLY statement fails half-way it can leave an INVALID index;
-- find it with:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- then DROP INDEX CONCURRENTLY IF EXISTS <name>; and run the CREATE again.


-- 1) Exact duplicate trigram indexes on ad_intelligence_creatives ------------------
-- 20260825 base:  ad_intelligence_creatives_headline_trgm_idx      gin (headline gin_trgm_ops)
-- 20261009 seo:   ad_creatives_headline_trgm                       gin (headline extensions.gin_trgm_ops)
-- 20260825 base:  ad_intelligence_creatives_primary_text_trgm_idx  gin (primary_text gin_trgm_ops)
-- 20261009 seo:   ad_creatives_primary_text_trgm                   gin (primary_text extensions.gin_trgm_ops)
-- Same column, same opclass (pg_trgm lives in schema extensions; the base
-- migration resolved the unqualified name to it), no predicate: identical.
-- The 16 Oct stats showed ad_creatives_headline_trgm as the one in use, so the
-- older base copies go. Each drop only runs when the partner exists AND is
-- valid AND has the same definition, so the last copy is never dropped.
-- (Plain DROP INDEX inside DO: dropping is instant; lock_timeout keeps it
-- from waiting behind a long query. If it times out, just run it again.)
-- Session default for the statements below (the DO blocks also set it).
SET lock_timeout = '3s';

DO $$
BEGIN
  -- The SQL editor may run each statement in a fresh session: set it here too.
  PERFORM set_config('lock_timeout', '3s', true);
  IF EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = to_regclass('public.ad_creatives_headline_trgm') AND i.indisvalid)
     AND to_regclass('public.ad_intelligence_creatives_headline_trgm_idx') IS NOT NULL
     AND replace(pg_get_indexdef(to_regclass('public.ad_creatives_headline_trgm')), 'ad_creatives_headline_trgm', 'X')
       = replace(pg_get_indexdef(to_regclass('public.ad_intelligence_creatives_headline_trgm_idx')), 'ad_intelligence_creatives_headline_trgm_idx', 'X')
  THEN
    DROP INDEX public.ad_intelligence_creatives_headline_trgm_idx;
    RAISE NOTICE 'dropped ad_intelligence_creatives_headline_trgm_idx';
  ELSE
    RAISE NOTICE 'kept ad_intelligence_creatives_headline_trgm_idx (no identical valid partner, or already gone)';
  END IF;
END $$;

DO $$
BEGIN
  -- The SQL editor may run each statement in a fresh session: set it here too.
  PERFORM set_config('lock_timeout', '3s', true);
  IF EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = to_regclass('public.ad_creatives_primary_text_trgm') AND i.indisvalid)
     AND to_regclass('public.ad_intelligence_creatives_primary_text_trgm_idx') IS NOT NULL
     AND replace(pg_get_indexdef(to_regclass('public.ad_creatives_primary_text_trgm')), 'ad_creatives_primary_text_trgm', 'X')
       = replace(pg_get_indexdef(to_regclass('public.ad_intelligence_creatives_primary_text_trgm_idx')), 'ad_intelligence_creatives_primary_text_trgm_idx', 'X')
  THEN
    DROP INDEX public.ad_intelligence_creatives_primary_text_trgm_idx;
    RAISE NOTICE 'dropped ad_intelligence_creatives_primary_text_trgm_idx';
  ELSE
    RAISE NOTICE 'kept ad_intelligence_creatives_primary_text_trgm_idx (no identical valid partner, or already gone)';
  END IF;
END $$;


-- 2) Exact duplicate btree on ad_intelligence_markets ------------------------------
-- 20260826: ad_intelligence_markets_country_creative_idx (country, creative_id)
-- 20260913: idx_adspy_markets_country_creative           (country, creative_id)
-- Identical; the older name goes, only if the newer one is there and valid.
DO $$
BEGIN
  -- The SQL editor may run each statement in a fresh session: set it here too.
  PERFORM set_config('lock_timeout', '3s', true);
  IF EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = to_regclass('public.idx_adspy_markets_country_creative') AND i.indisvalid)
     AND to_regclass('public.ad_intelligence_markets_country_creative_idx') IS NOT NULL
     AND replace(pg_get_indexdef(to_regclass('public.idx_adspy_markets_country_creative')), 'idx_adspy_markets_country_creative', 'X')
       = replace(pg_get_indexdef(to_regclass('public.ad_intelligence_markets_country_creative_idx')), 'ad_intelligence_markets_country_creative_idx', 'X')
  THEN
    DROP INDEX public.ad_intelligence_markets_country_creative_idx;
    RAISE NOTICE 'dropped ad_intelligence_markets_country_creative_idx';
  ELSE
    RAISE NOTICE 'kept ad_intelligence_markets_country_creative_idx (no identical valid partner, or already gone)';
  END IF;
END $$;


-- CONCURRENTLY statements below block no reads or writes; do not let a 3 s
-- timeout abort them half-way (that would leave an INVALID index).
RESET lock_timeout;


-- 3) Unused indexes on ad_intelligence_creative_versions --------------------------
-- (content_hash) alone: no query looks a version up by hash without its
-- creative; the ON CONFLICT (creative_id, content_hash) of the version
-- trigger uses the unique (creative_id, content_hash) index.
DROP INDEX CONCURRENTLY IF EXISTS public.ad_intelligence_creative_versions_hash_idx;

-- (is_currently_active, last_observed_at DESC): no query filters versions by
-- is_currently_active. adspy_creative_history orders by last_observed_at only
-- (served by ad_intelligence_creative_versions_last_seen_idx, kept); Today
-- reads by (creative_id, first_observed_at) (creative_first_idx, kept).
DROP INDEX CONCURRENTLY IF EXISTS public.ad_intelligence_creative_versions_active_idx;


-- 4) last_seen_at indexes on ad_intelligence_creatives -----------------------------
-- The nightly "seen again" update writes last_seen_at on every live ad; each
-- btree containing last_seen_at gets a new entry per update. Kept:
--   idx_adspy_creatives_platform_advertiser_active_seen
--     (platform, advertiser_id, is_currently_active DESC, last_seen_at DESC, id)
--     serves every page-scoped read (search by Page ID, Brand Vault,
--     mark-stopped, Today) and stays.
-- Dropped only when covered:
--   ad_intelligence_creatives_active_idx (is_currently_active, last_seen_at DESC)
--   ad_intelligence_creatives_last_seen_idx (platform, is_currently_active, last_seen_at DESC)
--   No query orders all creatives by last_seen_at: the name/keyword searches
--   order by is_currently_active DESC NULLS LAST, last_seen_at DESC NULLS LAST,
--   which neither index can return (their direction/NULLS order differs), so
--   they sort anyway. Filters on (platform, is_currently_active) are served by
--   ad_intelligence_creatives_active_first_seen_idx
--   (platform, is_currently_active, first_seen_at DESC NULLS LAST), which the
--   decode picker, landing check, SEO and fresh feed already use.
--   Each drop runs only when that covering index exists and is valid.
DO $$
BEGIN
  -- The SQL editor may run each statement in a fresh session: set it here too.
  PERFORM set_config('lock_timeout', '3s', true);
  IF EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = to_regclass('public.ad_intelligence_creatives_active_first_seen_idx') AND i.indisvalid)
     AND EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = to_regclass('public.idx_adspy_creatives_platform_advertiser_active_seen') AND i.indisvalid)
  THEN
    DROP INDEX IF EXISTS public.ad_intelligence_creatives_last_seen_idx;
    DROP INDEX IF EXISTS public.ad_intelligence_creatives_active_idx;
    RAISE NOTICE 'dropped ad_intelligence_creatives_last_seen_idx / _active_idx (if present)';
  ELSE
    RAISE NOTICE 'kept last_seen/active indexes: covering index missing or invalid';
  END IF;
END $$;

-- Range filters on last_seen_at (e.g. "seen in the last N days" scans by ops
-- scripts) get a BRIN instead: a few pages in size, and on PG16+ a BRIN
-- (summarizing) index does not block HOT updates.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ad_intelligence_creatives_last_seen_brin
  ON public.ad_intelligence_creatives USING brin (last_seen_at);

-- Room on each page for in-place (HOT) updates. Applies to pages written from
-- now on (no rewrite). Same value as the 16 Oct phase 1; harmless to repeat.
ALTER TABLE public.ad_intelligence_creatives SET (fillfactor = 85);


-- 5) Media backfill queue (media_state from c1) ------------------------------------
-- Only ads never tried whose thumbnail is still a Meta CDN link. Ordered by
-- created_at (never updated), so the nightly last_seen_at/updated_at writes
-- do not touch this index. Shrinks as ads are marked stored/dead.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ad_intelligence_creatives_media_pending_idx
  ON public.ad_intelligence_creatives (created_at DESC)
  WHERE media_state IS NULL AND platform = 'meta' AND thumbnail_url LIKE '%fbcdn%';


-- 6) "Full library ready" email lookup (lib/ad-intelligence/jobs/notify-ready.ts) ---
-- The jobs table has no page column; the page is the collection_key suffix,
-- so the leading-wildcard LIKE stays, but only over the last 72 h of
-- advertiser jobs in one country, read through this small partial index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ad_intelligence_collection_jobs_recent_adv_idx
  ON public.ad_intelligence_collection_jobs (country, created_at DESC)
  WHERE platform = 'meta' AND mode = 'advertiser';


-- Afterwards: re-run the size query above, and
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;   -- expect no rows
-- Rollback (only if ever needed; CONCURRENTLY, one at a time):
--   CREATE INDEX CONCURRENTLY ad_intelligence_creatives_headline_trgm_idx ON public.ad_intelligence_creatives USING gin (headline extensions.gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY ad_intelligence_creatives_primary_text_trgm_idx ON public.ad_intelligence_creatives USING gin (primary_text extensions.gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY ad_intelligence_markets_country_creative_idx ON public.ad_intelligence_markets (country, creative_id);
--   CREATE INDEX CONCURRENTLY ad_intelligence_creative_versions_hash_idx ON public.ad_intelligence_creative_versions (content_hash);
--   CREATE INDEX CONCURRENTLY ad_intelligence_creative_versions_active_idx ON public.ad_intelligence_creative_versions (is_currently_active, last_observed_at DESC);
--   CREATE INDEX CONCURRENTLY ad_intelligence_creatives_last_seen_idx ON public.ad_intelligence_creatives (platform, is_currently_active, last_seen_at DESC);
--   CREATE INDEX CONCURRENTLY ad_intelligence_creatives_active_idx ON public.ad_intelligence_creatives (is_currently_active, last_seen_at DESC);
--   DROP INDEX CONCURRENTLY IF EXISTS public.ad_intelligence_creatives_last_seen_brin;
--   DROP INDEX CONCURRENTLY IF EXISTS public.ad_intelligence_creatives_media_pending_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS public.ad_intelligence_collection_jobs_recent_adv_idx;
