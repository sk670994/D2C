alter table public.ad_intelligence_advertisers
  add column if not exists facebook_username text;

alter table public.ad_intelligence_advertisers
  add column if not exists instagram_username text;

alter table public.ad_intelligence_advertisers
  add column if not exists likes bigint;

alter table public.ad_intelligence_advertisers
  add column if not exists ig_followers bigint;

alter table public.ad_intelligence_advertisers
  add column if not exists active_ad_count integer not null default 0;

alter table public.ad_intelligence_advertisers
  add column if not exists total_ad_count integer not null default 0;

alter table public.ad_intelligence_advertisers
  add column if not exists identity_confidence real not null default 0;

alter table public.ad_intelligence_advertisers
  add column if not exists last_discovered_at timestamptz;

alter table public.ad_intelligence_advertisers
  add column if not exists last_active_at timestamptz;

create index if not exists
  idx_adspy_advertisers_instagram_username_trgm
on public.ad_intelligence_advertisers
using gin (
  lower(coalesce(instagram_username, ''))
  gin_trgm_ops
);

create index if not exists
  idx_adspy_advertisers_facebook_username_trgm
on public.ad_intelligence_advertisers
using gin (
  lower(coalesce(facebook_username, ''))
  gin_trgm_ops
);

create index if not exists
  idx_adspy_advertisers_country_platform
on public.ad_intelligence_advertisers (
  platform,
  country
);

create or replace function public.adspy_upsert_advertiser_v2(
  p_platform text,
  p_page_id text,
  p_page_name text,
  p_normalized_name text,
  p_domain text default null,
  p_profile_url text default null,
  p_profile_image_url text default null,
  p_category text default null,
  p_verification text default null,
  p_country text default null,
  p_entity_type text default null,
  p_source text default 'meta_ad_library',
  p_likes bigint default null,
  p_ig_followers bigint default null,
  p_facebook_username text default null,
  p_instagram_username text default null
)
returns public.ad_intelligence_advertisers
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row public.ad_intelligence_advertisers;
begin
  insert into public.ad_intelligence_advertisers (
    platform,
    page_id,
    page_name,
    normalized_name,
    domain,
    profile_url,
    profile_image_url,
    category,
    verification,
    country,
    entity_type,
    source,
    likes,
    ig_followers,
    facebook_username,
    instagram_username,
    last_seen_at,
    last_discovered_at,
    updated_at
  )
  values (
    lower(trim(p_platform)),
    trim(p_page_id),
    trim(p_page_name),
    lower(trim(p_normalized_name)),
    nullif(trim(p_domain), ''),
    nullif(trim(p_profile_url), ''),
    nullif(trim(p_profile_image_url), ''),
    nullif(trim(p_category), ''),
    nullif(trim(p_verification), ''),
    nullif(upper(trim(p_country)), ''),
    nullif(trim(p_entity_type), ''),
    coalesce(
      nullif(trim(p_source), ''),
      'meta_ad_library'
    ),
    p_likes,
    p_ig_followers,
    nullif(trim(p_facebook_username), ''),
    nullif(trim(p_instagram_username), ''),
    now(),
    now(),
    now()
  )
  on conflict (platform, page_id)
  do update set
    page_name =
      excluded.page_name,

    normalized_name =
      excluded.normalized_name,

    domain =
      coalesce(
        excluded.domain,
        public.ad_intelligence_advertisers.domain
      ),

    profile_url =
      coalesce(
        excluded.profile_url,
        public.ad_intelligence_advertisers.profile_url
      ),

    profile_image_url =
      coalesce(
        excluded.profile_image_url,
        public.ad_intelligence_advertisers.profile_image_url
      ),

    category =
      coalesce(
        excluded.category,
        public.ad_intelligence_advertisers.category
      ),

    verification =
      coalesce(
        excluded.verification,
        public.ad_intelligence_advertisers.verification
      ),

    country =
      coalesce(
        excluded.country,
        public.ad_intelligence_advertisers.country
      ),

    entity_type =
      coalesce(
        excluded.entity_type,
        public.ad_intelligence_advertisers.entity_type
      ),

    likes =
      coalesce(
        excluded.likes,
        public.ad_intelligence_advertisers.likes
      ),

    ig_followers =
      coalesce(
        excluded.ig_followers,
        public.ad_intelligence_advertisers.ig_followers
      ),

    facebook_username =
      coalesce(
        excluded.facebook_username,
        public.ad_intelligence_advertisers.facebook_username
      ),

    instagram_username =
      coalesce(
        excluded.instagram_username,
        public.ad_intelligence_advertisers.instagram_username
      ),

    source =
      excluded.source,

    last_seen_at =
      now(),

    last_discovered_at =
      now(),

    updated_at =
      now()

  returning *
  into result_row;

  return result_row;
end;
$$;

revoke all
on function public.adspy_upsert_advertiser_v2(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  bigint,
  text,
  text
)
from public;

grant execute
on function public.adspy_upsert_advertiser_v2(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  bigint,
  text,
  text
)
to service_role;