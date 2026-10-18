-- Search ignores punctuation and spaces: "ptal" finds "P-TAL", "loreal" finds
-- "L'Oréal", "ponds" finds "POND'S". Fallback used by the autocomplete route
-- only when the normal prefix search finds nothing (small table, seq scan ok).
create or replace function public.adspy_autocomplete_compact(
  p_query text,
  p_platform text default 'meta',
  p_country text default 'IN',
  p_limit integer default 8
)
returns table (
  id text, page_id text, label text, domain text, profile_url text,
  profile_image_url text, category text, verification text,
  likes bigint, ig_followers bigint, score real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with input as (
    select
      regexp_replace(lower(unaccent_safe), '[^a-z0-9]', '', 'g') as q,
      lower(coalesce(nullif(trim(p_platform), ''), 'meta')) as platform,
      upper(coalesce(nullif(trim(p_country), ''), 'IN')) as country,
      least(greatest(coalesce(p_limit, 8), 1), 12) as result_limit
    from (select translate(coalesce(p_query, ''), 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ', 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn') as unaccent_safe) s
  )
  select
    a.id::text, a.page_id::text, a.page_name, a.domain, a.profile_url,
    a.profile_image_url, a.category, a.verification, a.likes, a.ig_followers,
    (case when c.name = i.q then 20000 else 15000 end
      + case when upper(coalesce(a.verification, '')) = 'VERIFIED' then 250 else 0 end
      + least(coalesce(a.active_ad_count, 0) * 25, 500))::real as score
  from public.ad_intelligence_advertisers a
  cross join input i
  cross join lateral (
    select regexp_replace(lower(translate(coalesce(a.page_name, ''), 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ', 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^a-z0-9]', '', 'g') as name
  ) c
  where length(i.q) >= 3
    and lower(a.platform) = i.platform
    and (a.country is null or upper(a.country) = i.country)
    and c.name like i.q || '%'
  order by score desc, a.last_seen_at desc nulls last
  limit (select result_limit from input);
$$;

revoke all on function public.adspy_autocomplete_compact(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.adspy_autocomplete_compact(text, text, text, integer) to service_role;
