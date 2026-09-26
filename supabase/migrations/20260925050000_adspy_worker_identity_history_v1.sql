-- AdSpy: persistent worker registry, identity guards, stable change history (v1)
--
-- 1) adspy_workers: one row per VPS worker process (heartbeat + stats), so
--    "is the collector alive?" is answerable with SQL instead of SSH.
-- 2) Drop an exact duplicate unique index on creatives (the constraint
--    ad_intelligence_creatives_platform_external_key_unique already enforces
--    the same (platform, external_ad_key) uniqueness).
-- 3) Identity guard: a known Meta Page ID is never replaced by NULL.
--    (The app already does this; the trigger makes it true for every writer.)
-- 4) Stable content hash (v2). The old hash included signed Meta CDN media
--    URLs, the scrape URL and metadata.collectedAt, so every re-scrape looked
--    like a "new version" (9,385 versions for 4,054 creatives). v2 hashes
--    only what the advertiser actually wrote/chose. Existing versions are
--    re-hashed and merged; the old rows are kept in a backup table.
-- 5) Repair advertiser/creator names split by the old "Brand x Creator"
--    parser bug ("Foxtale" -> advertiser "Fo", creator "tale"). Only rows
--    where a known Meta page name proves the original name are changed.
--    No Page ID is ever assigned by name.
--
-- Rollback notes are at the end of the file.

BEGIN;

-- 1) Worker registry ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adspy_workers (
  worker_id          TEXT PRIMARY KEY,
  host               TEXT,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_request_id UUID,
  stats              JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.adspy_workers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adspy_workers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adspy_workers TO service_role;

-- Operational view: queue depth, oldest waiting item, live workers.
CREATE OR REPLACE VIEW public.adspy_ops_status AS
SELECT
  (SELECT count(*) FROM public.adspy_requests WHERE status IN ('queued','retrying')) AS waiting_requests,
  (SELECT count(*) FROM public.adspy_requests WHERE status = 'running')               AS running_requests,
  (SELECT extract(epoch FROM now() - min(created_at))::int
     FROM public.adspy_requests WHERE status IN ('queued','retrying'))                AS oldest_waiting_sec,
  (SELECT count(*) FROM public.adspy_requests
     WHERE status = 'failed' AND updated_at > now() - interval '24 hours')           AS failed_24h,
  (SELECT count(*) FROM public.adspy_requests
     WHERE status = 'completed' AND updated_at > now() - interval '24 hours')        AS completed_24h,
  (SELECT count(*) FROM public.adspy_workers
     WHERE heartbeat_at > now() - interval '2 minutes')                              AS live_workers,
  (SELECT max(heartbeat_at) FROM public.adspy_workers)                               AS last_worker_heartbeat;
REVOKE ALL ON public.adspy_ops_status FROM anon, authenticated;
GRANT SELECT ON public.adspy_ops_status TO service_role;


-- 2) Duplicate index ---------------------------------------------------------
DROP INDEX IF EXISTS public.ad_intelligence_creatives_platform_external_key_uidx;


-- 3) Identity guard ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adspy_keep_known_advertiser_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.advertiser_id IS NOT NULL AND btrim(OLD.advertiser_id) <> ''
     AND (NEW.advertiser_id IS NULL OR btrim(NEW.advertiser_id) = '') THEN
    NEW.advertiser_id := OLD.advertiser_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS adspy_keep_known_advertiser_id ON public.ad_intelligence_creatives;
CREATE TRIGGER adspy_keep_known_advertiser_id
BEFORE UPDATE OF advertiser_id ON public.ad_intelligence_creatives
FOR EACH ROW EXECUTE FUNCTION public.adspy_keep_known_advertiser_id();


-- 4) Stable content hash --------------------------------------------------------
-- Same signature as before (the capture trigger keeps calling it), but only
-- advertiser-authored creative content is hashed. Identity fields, media URLs
-- (signed, rotating), the scrape URL and metadata are ignored.
CREATE OR REPLACE FUNCTION public.adspy_creative_content_hash(
  p_advertiser_name text, p_advertiser_id text, p_creator_name text, p_partnership_type text,
  p_creative_type text, p_image_url text, p_video_url text, p_thumbnail_url text,
  p_video_duration_seconds integer, p_primary_text text, p_headline text, p_description text,
  p_call_to_action text, p_landing_page_url text, p_source_url text, p_product_name text,
  p_product_price numeric, p_max_price numeric, p_currency text, p_offer text,
  p_transcript text, p_transcript_status text, p_metadata jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT md5(concat_ws(E'\u001f',
    'v2',
    lower(btrim(coalesce(p_creative_type, ''))),
    btrim(regexp_replace(coalesce(p_primary_text, ''), '\s+', ' ', 'g')),
    btrim(regexp_replace(coalesce(p_headline, ''), '\s+', ' ', 'g')),
    btrim(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g')),
    lower(btrim(coalesce(p_call_to_action, ''))),
    -- landing page without query string / fragment (tracking params rotate)
    lower(regexp_replace(btrim(coalesce(p_landing_page_url, '')), '[?#].*$', '')),
    lower(btrim(coalesce(p_product_name, ''))),
    coalesce(p_product_price, 0)::text,
    coalesce(p_max_price, 0)::text,
    lower(btrim(coalesce(p_currency, ''))),
    btrim(regexp_replace(coalesce(p_offer, ''), '\s+', ' ', 'g')),
    coalesce(p_video_duration_seconds, 0)::text,
    btrim(regexp_replace(coalesce(p_transcript, ''), '\s+', ' ', 'g'))
  ));
$$;

-- Backup, then re-hash and merge versions that differ only in volatile fields.
CREATE TABLE IF NOT EXISTS public.ad_intelligence_creative_versions_backup_20260925
  AS TABLE public.ad_intelligence_creative_versions WITH NO DATA;
INSERT INTO public.ad_intelligence_creative_versions_backup_20260925
SELECT * FROM public.ad_intelligence_creative_versions
WHERE NOT EXISTS (SELECT 1 FROM public.ad_intelligence_creative_versions_backup_20260925 LIMIT 1);
ALTER TABLE public.ad_intelligence_creative_versions_backup_20260925 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_intelligence_creative_versions_backup_20260925 FROM anon, authenticated;

CREATE TEMP TABLE _v ON COMMIT DROP AS
SELECT
  v.id,
  v.creative_id,
  public.adspy_creative_content_hash(
    v.advertiser_name, v.advertiser_id, v.creator_name, v.partnership_type, v.creative_type,
    v.image_url, v.video_url, v.thumbnail_url, v.video_duration_seconds, v.primary_text,
    v.headline, v.description, v.call_to_action, v.landing_page_url, v.source_url,
    v.product_name, v.product_price, v.max_price, v.currency, v.offer, v.transcript,
    v.transcript_status, v.metadata) AS nh,
  v.first_observed_at,
  v.last_observed_at,
  v.seen_count,
  v.is_currently_active
FROM public.ad_intelligence_creative_versions v;

CREATE TEMP TABLE _keep ON COMMIT DROP AS
SELECT DISTINCT ON (creative_id, nh)
  id AS keep_id,
  creative_id,
  nh,
  min(first_observed_at) OVER w AS first_obs,
  max(last_observed_at)  OVER w AS last_obs,
  sum(seen_count)        OVER w AS seen,
  first_value(is_currently_active) OVER (PARTITION BY creative_id, nh ORDER BY last_observed_at DESC NULLS LAST) AS active_now
FROM _v
WINDOW w AS (PARTITION BY creative_id, nh)
ORDER BY creative_id, nh, first_observed_at ASC NULLS LAST, id;

DELETE FROM public.ad_intelligence_creative_versions v
WHERE NOT EXISTS (SELECT 1 FROM _keep k WHERE k.keep_id = v.id);

UPDATE public.ad_intelligence_creative_versions v
SET content_hash = k.nh,
    first_observed_at = k.first_obs,
    last_observed_at = k.last_obs,
    seen_count = k.seen,
    is_currently_active = k.active_now
FROM _keep k
WHERE k.keep_id = v.id;


-- 5) Name repair for the "x"-split parser bug -------------------------------------
-- Old values are kept so the repair can be undone row by row.
CREATE TABLE IF NOT EXISTS public.ad_intelligence_creatives_name_backup_20260925 (
  id UUID PRIMARY KEY,
  advertiser_name TEXT,
  creator_name TEXT,
  partnership_type TEXT,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_intelligence_creatives_name_backup_20260925 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_intelligence_creatives_name_backup_20260925 FROM anon, authenticated;
INSERT INTO public.ad_intelligence_creatives_name_backup_20260925 (id, advertiser_name, creator_name, partnership_type)
SELECT id, advertiser_name, creator_name, partnership_type
FROM public.ad_intelligence_creatives
WHERE partnership_type = 'collaboration' AND creator_name IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Corrections of parser output are not creative changes: don't version them.
ALTER TABLE public.ad_intelligence_creatives DISABLE TRIGGER adspy_creative_version_capture;

-- 5a) Page ID known and its page name equals advertiser||'x'||creator.
UPDATE public.ad_intelligence_creatives c
SET advertiser_name = a.page_name,
    creator_name = NULL,
    partnership_type = 'direct'
FROM public.ad_intelligence_advertisers a
WHERE c.partnership_type = 'collaboration'
  AND c.creator_name IS NOT NULL
  AND a.platform = c.platform
  AND a.page_id = c.advertiser_id
  AND lower(a.page_name) = lower(c.advertiser_name || 'x' || c.creator_name);

-- 5b) Name already right, creator is the tail of the name ("Foxtale" / "tale").
UPDATE public.ad_intelligence_creatives c
SET creator_name = NULL,
    partnership_type = 'direct'
FROM public.ad_intelligence_advertisers a
WHERE c.partnership_type = 'collaboration'
  AND c.creator_name IS NOT NULL
  AND a.platform = c.platform
  AND a.page_id = c.advertiser_id
  AND lower(a.page_name) = lower(c.advertiser_name)
  AND lower(c.advertiser_name) LIKE '%x' || lower(c.creator_name);

-- 5c) No Page ID: fix the NAME only when a known page has exactly that name.
--     advertiser_id stays NULL (a name is not an identity).
UPDATE public.ad_intelligence_creatives c
SET advertiser_name = a.page_name,
    creator_name = NULL,
    partnership_type = 'direct'
FROM (
  SELECT DISTINCT ON (lower(page_name)) platform, page_name
  FROM public.ad_intelligence_advertisers
  WHERE page_name IS NOT NULL
  ORDER BY lower(page_name), updated_at DESC NULLS LAST
) a
WHERE c.partnership_type = 'collaboration'
  AND c.creator_name IS NOT NULL
  AND (c.advertiser_id IS NULL OR btrim(c.advertiser_id) = '')
  AND a.platform = c.platform
  AND lower(a.page_name) = lower(c.advertiser_name || 'x' || c.creator_name);

ALTER TABLE public.ad_intelligence_creatives ENABLE TRIGGER adspy_creative_version_capture;

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260925050000', 'adspy_worker_identity_history_v1')
ON CONFLICT DO NOTHING;

COMMIT;

-- Rollback:
--   DROP VIEW public.adspy_ops_status; DROP TABLE public.adspy_workers;
--   DROP TRIGGER adspy_keep_known_advertiser_id ON public.ad_intelligence_creatives;
--   CREATE UNIQUE INDEX ad_intelligence_creatives_platform_external_key_uidx
--     ON public.ad_intelligence_creatives (platform, external_ad_key);
--   Hash: re-apply adspy_creative_content_hash from
--     20260913100000_adspy_creative_versions_v1.sql, then
--     TRUNCATE ad_intelligence_creative_versions and re-insert from
--     ad_intelligence_creative_versions_backup_20260925.
--   Names: UPDATE ad_intelligence_creatives c SET advertiser_name = b.advertiser_name,
--            creator_name = b.creator_name, partnership_type = b.partnership_type
--          FROM ad_intelligence_creatives_name_backup_20260925 b WHERE b.id = c.id;
