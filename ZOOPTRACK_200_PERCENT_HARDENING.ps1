$ErrorActionPreference = "Stop"
Set-Location "F:\D2C"

Write-Host "=== Zooptrack 200% hardening patch ===" -ForegroundColor Cyan

# 1) Fix the Vercel deployment blocker: rewrite vercel.json as UTF-8 WITHOUT BOM.
$vercel = @'
{
  "crons": [
    {
      "path": "/api/cron/fetch-ad-data",
      "schedule": "0 2 * * *"
    }
  ],
  "functions": {
    "app/api/queues/adspy-collection/route.ts": {
      "maxDuration": 60,
      "experimentalTriggers": [
        {
          "type": "queue/v2beta",
          "topic": "adspy-collection"
        }
      ]
    }
  }
}
'@
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) "vercel.json"),
  $vercel,
  (New-Object System.Text.UTF8Encoding($false))
)
Write-Host "[OK] vercel.json rewritten without BOM"

# 2) Keep the two production migrations that were already applied remotely
#    in the local repo so future `supabase db push` stays reproducible.
$m1 = @'
BEGIN;

ALTER TABLE public.adspy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adspy_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS adspy_runs_user_id_idx
  ON public.adspy_runs (user_id);

CREATE INDEX IF NOT EXISTS ad_intelligence_tracked_brands_brand_id_idx
  ON public.ad_intelligence_tracked_brands (brand_id);

ALTER FUNCTION public.set_ad_intelligence_updated_at()
  SET search_path = public;

ALTER FUNCTION public.set_ad_intelligence_v2_updated_at()
  SET search_path = public;

ALTER FUNCTION public.get_ad_intelligence_rollup(text, text, text)
  SET search_path = public;

ALTER FUNCTION public.adspy_creative_content_hash(
  text, text, text, text, text, text, text, text,
  integer,
  text, text, text, text, text, text, text,
  numeric, numeric,
  text, text, text, text,
  jsonb
)
  SET search_path = public;

COMMIT;
'@

$m2 = @'
CREATE OR REPLACE FUNCTION public.adspy_analysis_rows_v2(
  p_query TEXT,
  p_country TEXT,
  p_platform TEXT,
  p_mode TEXT DEFAULT 'advertiser',
  p_advertiser_page_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20000
)
RETURNS TABLE (
  id UUID,
  advertiser_name TEXT,
  creator_name TEXT,
  creative_type TEXT,
  primary_text TEXT,
  headline TEXT,
  offer TEXT,
  call_to_action TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  is_currently_active BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.advertiser_name,
    c.creator_name,
    c.creative_type,
    c.primary_text,
    c.headline,
    c.offer,
    c.call_to_action,
    c.first_seen_at,
    c.last_seen_at,
    c.is_currently_active
  FROM public.ad_intelligence_creatives AS c
  WHERE lower(c.platform) = lower(trim(p_platform))
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets AS m
      WHERE m.creative_id = c.id
        AND upper(trim(m.country)) = upper(trim(p_country))
    )
    AND (
      (
        lower(trim(p_mode)) = 'advertiser'
        AND (
          (
            NULLIF(trim(p_advertiser_page_id), '') IS NOT NULL
            AND c.advertiser_id = trim(p_advertiser_page_id)
          )
          OR (
            NULLIF(trim(p_advertiser_page_id), '') IS NULL
            AND lower(coalesce(c.advertiser_name, ''))
              LIKE '%' || lower(trim(p_query)) || '%'
          )
        )
      )
      OR
      (
        lower(trim(p_mode)) = 'keyword'
        AND (
          lower(coalesce(c.advertiser_name, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.creator_name, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.headline, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.product_name, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.primary_text, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.description, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.offer, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.call_to_action, '')) LIKE '%' || lower(trim(p_query)) || '%'
        )
      )
    )
  ORDER BY c.last_seen_at DESC NULLS LAST, c.id
  LIMIT LEAST(
    20000,
    GREATEST(1, COALESCE(p_limit, 20000))
  );
$$;

REVOKE ALL ON FUNCTION public.adspy_analysis_rows_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.adspy_analysis_rows_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO service_role;
'@

$migDir = Join-Path (Get-Location) "supabase\migrations"
New-Item -ItemType Directory -Force -Path $migDir | Out-Null

[System.IO.File]::WriteAllText(
  (Join-Path $migDir "20260923000000_adspy_production_hardening_v1.sql"),
  $m1,
  (New-Object System.Text.UTF8Encoding($false))
)
[System.IO.File]::WriteAllText(
  (Join-Path $migDir "20260923010000_adspy_analysis_exact_page_v1.sql"),
  $m2,
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "[OK] migration files synchronized"

# 3) Verify the two migrations are already present remotely before db push.
Write-Host ""
Write-Host "Run these checks next:" -ForegroundColor Yellow
Write-Host "  npx supabase migration list"
Write-Host "  git diff --check"
Write-Host "  npm run build"
Write-Host ""
Write-Host "Do NOT run db push until migration list confirms both versions are already remote." -ForegroundColor Yellow
