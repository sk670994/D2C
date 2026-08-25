-- ============================================================
-- SHARED ADS PY CACHE
-- One expensive provider scrape can serve many users.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.adspy_shared_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cache_key TEXT NOT NULL UNIQUE,

  query TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'IN',
  platform TEXT NOT NULL
    CHECK (platform IN ('meta', 'google', 'linkedin')),

  mode TEXT NOT NULL DEFAULT 'advertiser'
    CHECK (mode IN ('advertiser', 'keyword')),

  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (
      status IN (
        'queued',
        'running',
        'ready',
        'failed'
      )
    ),

  ads JSONB NOT NULL DEFAULT '[]'::jsonb,

  intelligence JSONB NOT NULL DEFAULT '{}'::jsonb,

  error_message TEXT,

  lease_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by normalized search identity.
CREATE INDEX IF NOT EXISTS adspy_shared_cache_lookup_idx
ON public.adspy_shared_cache(
  platform,
  mode,
  country,
  query
);

-- Fast status/job lookup.
CREATE INDEX IF NOT EXISTS adspy_shared_cache_status_idx
ON public.adspy_shared_cache(
  status,
  updated_at DESC
);

-- Cleanup / freshness queries.
CREATE INDEX IF NOT EXISTS adspy_shared_cache_updated_idx
ON public.adspy_shared_cache(
  updated_at DESC
);

-- ============================================================
-- RLS
--
-- This cache is SERVER-OWNED.
-- Do NOT expose it directly to browser clients.
-- ============================================================

ALTER TABLE public.adspy_shared_cache ENABLE ROW LEVEL SECURITY;

-- No public/authenticated policies intentionally.
-- Server code should access it with the server-side
-- Supabase configuration appropriate to your application.