-- Fast keyword search over ad copy for the public season pages (/seasons/*).
-- Trigram indexes make ILIKE '%diwali%' an index lookup instead of a full scan.
-- Additive only. Safe to re-run.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS ad_creatives_primary_text_trgm
  ON public.ad_intelligence_creatives USING gin (primary_text extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ad_creatives_headline_trgm
  ON public.ad_intelligence_creatives USING gin (headline extensions.gin_trgm_ops);
