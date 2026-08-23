-- Run this once in Supabase for existing projects before enabling Google AdSpy.
ALTER TABLE public.adspy_snapshots
  DROP CONSTRAINT IF EXISTS adspy_snapshots_platform_check;

ALTER TABLE public.adspy_snapshots
  ADD CONSTRAINT adspy_snapshots_platform_check
  CHECK (platform IN ('meta', 'google', 'linkedin'));
