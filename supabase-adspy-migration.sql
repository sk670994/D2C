-- ADSPY competitor intelligence storage.
-- This is intentionally separate from ad_metrics, which stores the user's own ad performance.

CREATE TABLE IF NOT EXISTS public.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  country TEXT NOT NULL DEFAULT 'IN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.competitor_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_ad_id TEXT,
  advertiser_name TEXT NOT NULL,
  advertiser_id TEXT,
  country TEXT,
  creative_type TEXT,
  image_url TEXT,
  video_url TEXT,
  primary_text TEXT,
  headline TEXT,
  description TEXT,
  call_to_action TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  landing_page_url TEXT,
  source_url TEXT,
  is_active BOOLEAN,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS competitor_ads_user_platform_external_idx
ON public.competitor_ads(user_id, platform, external_ad_id)
WHERE external_ad_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS competitors_user_idx ON public.competitors(user_id);
CREATE INDEX IF NOT EXISTS competitor_ads_user_platform_idx ON public.competitor_ads(user_id, platform);
CREATE INDEX IF NOT EXISTS competitor_ads_competitor_idx ON public.competitor_ads(competitor_id);

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view their competitors" ON public.competitors;
CREATE POLICY "users can view their competitors" ON public.competitors FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "users can insert their competitors" ON public.competitors;
CREATE POLICY "users can insert their competitors" ON public.competitors FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users can update their competitors" ON public.competitors;
CREATE POLICY "users can update their competitors" ON public.competitors FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users can delete their competitors" ON public.competitors;
CREATE POLICY "users can delete their competitors" ON public.competitors FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can view their competitor ads" ON public.competitor_ads;
CREATE POLICY "users can view their competitor ads" ON public.competitor_ads FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "users can insert their competitor ads" ON public.competitor_ads;
CREATE POLICY "users can insert their competitor ads" ON public.competitor_ads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users can update their competitor ads" ON public.competitor_ads;
CREATE POLICY "users can update their competitor ads" ON public.competitor_ads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users can delete their competitor ads" ON public.competitor_ads;
CREATE POLICY "users can delete their competitor ads" ON public.competitor_ads FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TABLE IF NOT EXISTS public.adspy_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  query TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'IN',
  platform TEXT NOT NULL DEFAULT 'meta',

  total_ads INTEGER NOT NULL DEFAULT 0,

  -- Complete AdSpy dataset returned by the scraper.
  ads JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Derived intelligence from AdSpy.
  intelligence JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adspy_snapshots_user_idx
ON public.adspy_snapshots(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS adspy_snapshots_query_idx
ON public.adspy_snapshots(user_id, query, country, created_at DESC);

ALTER TABLE public.adspy_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view their adspy snapshots"
ON public.adspy_snapshots;

CREATE POLICY "users can view their adspy snapshots"
ON public.adspy_snapshots
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can insert their adspy snapshots"
ON public.adspy_snapshots;

CREATE POLICY "users can insert their adspy snapshots"
ON public.adspy_snapshots
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can delete their adspy snapshots"
ON public.adspy_snapshots;

CREATE POLICY "users can delete their adspy snapshots"
ON public.adspy_snapshots
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);