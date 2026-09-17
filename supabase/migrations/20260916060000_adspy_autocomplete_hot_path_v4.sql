begin;

create extension if not exists pg_trgm;

create index if not exists idx_adspy_autocomplete_platform_country_name_prefix
  on public.ad_intelligence_advertisers (
    platform,
    country,
    lower(page_name) text_pattern_ops
  );

create index if not exists idx_adspy_autocomplete_platform_country_normalized_prefix
  on public.ad_intelligence_advertisers (
    platform,
    country,
    lower(normalized_name) text_pattern_ops
  );

create index if not exists idx_adspy_autocomplete_platform_country_facebook_prefix
  on public.ad_intelligence_advertisers (
    platform,
    country,
    lower(coalesce(facebook_username, '')) text_pattern_ops
  );

create index if not exists idx_adspy_autocomplete_platform_country_instagram_prefix
  on public.ad_intelligence_advertisers (
    platform,
    country,
    lower(coalesce(instagram_username, '')) text_pattern_ops
  );

drop function if exists public.adspy_autocomplete_advertisers(text, text, text, integer);

create function public.adspy_autocomplete_advertisers(
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
  likes bigint,
  ig_followers bigint,
  score real
)
language sql
security definer
set search_path = public, extensions
as $$
  with input as (
    select
      lower(
        trim(
          regexp_replace(
            coalesce(p_query, ''),
            '[%_\\\\]',
            ' ',
            'g'
          )
        )
      ) as q,
      lower(coalesce(nullif(trim(p_platform), ''), 'meta')) as platform,
      upper(coalesce(nullif(trim(p_country), ''), 'IN')) as country,
      least(greatest(coalesce(p_limit, 8), 1), 12) as result_limit
  ),

  prefix_candidates as (
    select
      a.id::text as id,
      a.page_id::text as page_id,
      a.page_name as label,
      a.domain,
      a.profile_url,
      a.profile_image_url,
      a.category,
      a.verification,
      a.likes,
      a.ig_followers,
      (
        case
          when lower(trim(a.page_name)) = i.q then 22000
          when lower(trim(a.page_name)) like i.q || '%' then 16500
          when lower(trim(a.normalized_name)) like i.q || '%' then 15400
          when lower(coalesce(a.facebook_username, '')) like i.q || '%' then 14800
          when lower(coalesce(a.instagram_username, '')) like i.q || '%' then 14600
          else 0
        end
        + case
            when upper(coalesce(a.verification, '')) = 'VERIFIED' then 250
            else 0
          end
        + case
            when coalesce(a.active_ad_count, 0) > 0
              then least(coalesce(a.active_ad_count, 0) * 25, 500)
            else 0
          end
        + case
            when a.last_seen_at >= now() - interval '7 days' then 180
            when a.last_seen_at >= now() - interval '30 days' then 90
            else 0
          end
        + least(
            log(
              greatest(
                coalesce(a.likes, 0) + coalesce(a.ig_followers, 0) + 1,
                1
              ) + 1
            ) * 45,
            350
          )
      )::real as score
    from public.ad_intelligence_advertisers a
    cross join input i
    where
      lower(a.platform) = i.platform
      and (a.country is null or upper(a.country) = i.country)
      and length(i.q) >= 1
      and (
        lower(trim(a.page_name)) like i.q || '%'
        or lower(trim(a.normalized_name)) like i.q || '%'
        or lower(coalesce(a.facebook_username, '')) like i.q || '%'
        or lower(coalesce(a.instagram_username, '')) like i.q || '%'
      )
    order by score desc, a.last_seen_at desc nulls last, label asc
    limit 32
  ),

  contains_candidates as (
    select
      a.id::text as id,
      a.page_id::text as page_id,
      a.page_name as label,
      a.domain,
      a.profile_url,
      a.profile_image_url,
      a.category,
      a.verification,
      a.likes,
      a.ig_followers,
      (
        case
          when lower(trim(a.page_name)) like '%' || i.q || '%' then 9800
          when lower(trim(a.normalized_name)) like '%' || i.q || '%' then 9300
          when lower(coalesce(a.facebook_username, '')) like '%' || i.q || '%' then 8800
          when lower(coalesce(a.instagram_username, '')) like '%' || i.q || '%' then 8700
          else 0
        end
        + case
            when upper(coalesce(a.verification, '')) = 'VERIFIED' then 250
            else 0
          end
      )::real as score
    from public.ad_intelligence_advertisers a
    cross join input i
    where
      length(i.q) >= 2
      and lower(a.platform) = i.platform
      and (a.country is null or upper(a.country) = i.country)
      and (
        lower(trim(a.page_name)) like '%' || i.q || '%'
        or lower(trim(a.normalized_name)) like '%' || i.q || '%'
        or lower(coalesce(a.facebook_username, '')) like '%' || i.q || '%'
        or lower(coalesce(a.instagram_username, '')) like '%' || i.q || '%'
      )
    order by score desc, a.last_seen_at desc nulls last, label asc
    limit 24
  ),

  fuzzy_candidates as (
    select
      a.id::text as id,
      a.page_id::text as page_id,
      a.page_name as label,
      a.domain,
      a.profile_url,
      a.profile_image_url,
      a.category,
      a.verification,
      a.likes,
      a.ig_followers,
      (
        greatest(
          similarity(lower(trim(a.page_name)), i.q),
          similarity(lower(trim(a.normalized_name)), i.q),
          similarity(lower(coalesce(a.facebook_username, '')), i.q),
          similarity(lower(coalesce(a.instagram_username, '')), i.q)
        ) * 5000
        + case
            when lower(trim(a.page_name)) like i.q || '%' then 1800
            else 0
          end
        + case
            when upper(coalesce(a.verification, '')) = 'VERIFIED' then 250
            else 0
          end
      )::real as score
    from public.ad_intelligence_advertisers a
    cross join input i
    where
      length(i.q) >= 3
      and lower(a.platform) = i.platform
      and (a.country is null or upper(a.country) = i.country)
      and (
        lower(a.page_name) % i.q
        or lower(a.normalized_name) % i.q
        or lower(coalesce(a.facebook_username, '')) % i.q
        or lower(coalesce(a.instagram_username, '')) % i.q
      )
    order by score desc, a.last_seen_at desc nulls last, label asc
    limit 24
  ),

  merged as (
    select * from prefix_candidates
    union all
    select * from contains_candidates
    union all
    select * from fuzzy_candidates
  ),

  deduped as (
    select distinct on (page_id)
      id,
      page_id,
      label,
      domain,
      profile_url,
      profile_image_url,
      category,
      verification,
      likes,
      ig_followers,
      score
    from merged
    where nullif(trim(label), '') is not null
    order by page_id, score desc, label asc
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
    likes,
    ig_followers,
    score
  from deduped
  order by score desc, label asc
  limit (select result_limit from input);
$$;

revoke all on function public.adspy_autocomplete_advertisers(text, text, text, integer)
  from public;

grant execute on function public.adspy_autocomplete_advertisers(text, text, text, integer)
  to authenticated;

grant execute on function public.adspy_autocomplete_advertisers(text, text, text, integer)
  to service_role;

commit;
