-- Size of the ad-media bucket, so the collector can stay under the
-- Supabase Free 1 GB storage limit. Service role only.
CREATE OR REPLACE FUNCTION public.adspy_media_bucket_bytes()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM((o.metadata->>'size')::bigint), 0)::bigint
  FROM storage.objects o
  WHERE o.bucket_id = 'ad-media';
$$;

REVOKE ALL ON FUNCTION public.adspy_media_bucket_bytes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adspy_media_bucket_bytes() TO service_role;
