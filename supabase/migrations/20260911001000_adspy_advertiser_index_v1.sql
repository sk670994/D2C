create extension if not exists pg_trgm;

create table if not exists public.ad_intelligence_advertisers (
  id uuid primary key default gen_random_uuid(),

  platform text not null default 'meta',

  page_id text not null,

  page_name text not null,

  normalized_name text not null,

  domain text,

  profile_url text,

  profile_image_url text,

  category text,

  verification text,

  country text,

  entity_type text,

  source text not null default 'meta_ad_library',

  last_seen_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint ad_intelligence_advertisers_platform_check
    check (platform in ('meta', 'google', 'linkedin')),

  constraint ad_intelligence_advertisers_page_id_unique
    unique (platform, page_id)
);

create index if not exists idx_ad_intelligence_advertisers_platform
  on public.ad_intelligence_advertisers(platform);

create index if not exists idx_ad_intelligence_advertisers_name_trgm
  on public.ad_intelligence_advertisers
  using gin (normalized_name gin_trgm_ops);

create index if not exists idx_ad_intelligence_advertisers_page_name_trgm
  on public.ad_intelligence_advertisers
  using gin (
    lower(page_name) gin_trgm_ops
  );

create index if not exists idx_ad_intelligence_advertisers_country
  on public.ad_intelligence_advertisers(country);

create index if not exists idx_ad_intelligence_advertisers_last_seen
  on public.ad_intelligence_advertisers(last_seen_at desc);


create or replace function public.adspy_upsert_advertiser(
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
  p_source text default 'meta_ad_library'
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
    last_seen_at,
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
    coalesce(nullif(trim(p_source), ''), 'meta_ad_library'),
    now(),
    now()
  )
  on conflict (platform, page_id)
  do update set
    page_name = excluded.page_name,
    normalized_name = excluded.normalized_name,
    domain = coalesce(excluded.domain, public.ad_intelligence_advertisers.domain),
    profile_url = coalesce(
      excluded.profile_url,
      public.ad_intelligence_advertisers.profile_url
    ),
    profile_image_url = coalesce(
      excluded.profile_image_url,
      public.ad_intelligence_advertisers.profile_image_url
    ),
    category = coalesce(
      excluded.category,
      public.ad_intelligence_advertisers.category
    ),
    verification = coalesce(
      excluded.verification,
      public.ad_intelligence_advertisers.verification
    ),
    country = coalesce(
      excluded.country,
      public.ad_intelligence_advertisers.country
    ),
    entity_type = coalesce(
      excluded.entity_type,
      public.ad_intelligence_advertisers.entity_type
    ),
    source = excluded.source,
    last_seen_at = now(),
    updated_at = now()
  returning * into result_row;

  return result_row;
end;
$$;


create or replace function public.adspy_autocomplete_advertisers(
  p_query text,
  p_platform text default 'meta',
  p_country text default 'IN',
  p_limit integer default 8
)
returns table (
  id text,
  page_id text,
  label text,
  domain text,
  profile_url text,
  profile_image_url text,
  category text,
  verification text,
  score real
)
language sql
security definer
set search_path = public
as $$
  with input as (
    select
      lower(trim(coalesce(p_query, ''))) as q,
      least(
        greatest(coalesce(p_limit, 8), 1),
        12
      ) as result_limit
  ),

  candidates as (
    select
      a.id::text as id,
      a.page_id,
      a.page_name as label,
      a.domain,
      a.profile_url,
      a.profile_image_url,
      a.category,
      a.verification,

      (
        case
          when lower(trim(a.page_name)) = i.q
            then 10000

          when lower(trim(a.page_name)) like i.q || '%'
            then 7000

          when lower(trim(a.page_name)) like '%' || i.q || '%'
            then 4500

          when lower(trim(a.normalized_name)) like
            i.q || '%'
            then 4000

          else 0
        end

        +

        (
          greatest(
            similarity(
              lower(trim(a.page_name)),
              i.q
            ),
            similarity(
              lower(trim(a.normalized_name)),
              i.q
            )
          ) * 1000
        )
      )::real as score

    from public.ad_intelligence_advertisers a
    cross join input i

    where
      lower(a.platform) =
        coalesce(
          nullif(lower(trim(p_platform)), ''),
          'meta'
        )

      and length(i.q) >= 2

      and (
        lower(trim(a.page_name)) like '%' || i.q || '%'

        or lower(trim(a.normalized_name)) like '%' || i.q || '%'

        or similarity(
          lower(trim(a.page_name)),
          i.q
        ) >= 0.20

        or similarity(
          lower(trim(a.normalized_name)),
          i.q
        ) >= 0.20
      )

      and (
        p_country is null
        or trim(p_country) = ''
        or a.country is null
        or upper(a.country) = upper(trim(p_country))
      )
  )

  select
    id,
    page_id,
    label,
    domain,
    profile_url,
    profile_image_url,
    category,
    verification,
    score
  from candidates
  order by score desc, label asc
  limit (
    select result_limit
    from input
  );
$$;


revoke all
on function public.adspy_upsert_advertiser(
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
  text
)
from public;

grant execute
on function public.adspy_upsert_advertiser(
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
  text
)
to service_role;


revoke all
on function public.adspy_autocomplete_advertisers(
  text,
  text,
  text,
  integer
)
from public;

grant execute
on function public.adspy_autocomplete_advertisers(
  text,
  text,
  text,
  integer
)
to authenticated;

grant execute
on function public.adspy_autocomplete_advertisers(
  text,
  text,
  text,
  integer
)
to service_role;