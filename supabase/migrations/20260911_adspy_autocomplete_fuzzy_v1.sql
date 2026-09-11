create extension if not exists pg_trgm;

create or replace function public.adspy_autocomplete_advertisers(
  p_query text,
  p_platform text default 'meta',
  p_limit integer default 8
)
returns table (
  id text,
  label text,
  domain text,
  score real
)
language sql
security definer
set search_path = public, extensions
as $$
  with input as (
    select
      lower(trim(coalesce(p_query, ''))) as q,
      lower(
        regexp_replace(
          trim(coalesce(p_query, '')),
          '[^a-zA-Z0-9]+',
          ' ',
          'g'
        )
      ) as normalized_q,
      least(
        greatest(coalesce(p_limit, 8), 1),
        12
      ) as result_limit
  ),

  brand_matches as (
    select
      b.id::text as id,
      trim(b.canonical_name) as label,
      nullif(trim(b.domain), '') as domain,

      greatest(
        similarity(
          lower(coalesce(b.canonical_name, '')),
          i.q
        ),
        similarity(
          lower(coalesce(b.normalized_name, '')),
          i.normalized_q
        )
      ) as trigram_score,

      case
        when lower(trim(coalesce(b.canonical_name, ''))) = i.q
          then 10000

        when lower(trim(coalesce(b.canonical_name, ''))) like i.q || '%'
          then 7000

        when lower(trim(coalesce(b.canonical_name, ''))) like '%' || i.q || '%'
          then 4000

        else 0
      end as lexical_score

    from public.ad_intelligence_brands b
    cross join input i

    where
      length(i.q) >= 2
      and (
        lower(coalesce(b.canonical_name, '')) like '%' || i.q || '%'

        or lower(coalesce(b.normalized_name, '')) like '%' || i.normalized_q || '%'

        or similarity(
          lower(coalesce(b.canonical_name, '')),
          i.q
        ) >= 0.20

        or similarity(
          lower(coalesce(b.normalized_name, '')),
          i.normalized_q
        ) >= 0.20
      )
  ),

  creative_matches as (
    select
      coalesce(
        c.advertiser_id::text,
        md5(
          lower(
            trim(
              coalesce(c.advertiser_name, '')
            )
          )
        )
      ) as id,

      trim(c.advertiser_name) as label,

      null::text as domain,

      similarity(
        lower(
          trim(
            coalesce(c.advertiser_name, '')
          )
        ),
        i.q
      ) as trigram_score,

      case
        when lower(
          trim(
            coalesce(c.advertiser_name, '')
          )
        ) = i.q
          then 10000

        when lower(
          trim(
            coalesce(c.advertiser_name, '')
          )
        ) like i.q || '%'
          then 7000

        when lower(
          trim(
            coalesce(c.advertiser_name, '')
          )
        ) like '%' || i.q || '%'
          then 4000

        else 0
      end as lexical_score

    from public.ad_intelligence_creatives c
    cross join input i

    where
      c.platform =
        coalesce(
          nullif(
            lower(trim(p_platform)),
            ''
          ),
          'meta'
        )

      and length(i.q) >= 2

      and nullif(
        trim(c.advertiser_name),
        ''
      ) is not null

      and (
        lower(
          trim(c.advertiser_name)
        ) like '%' || i.q || '%'

        or similarity(
          lower(
            trim(c.advertiser_name)
          ),
          i.q
        ) >= 0.20
      )
  ),

  combined as (
    select
      id,
      label,
      domain,
      lexical_score
        + (trigram_score * 1000.0) as score
    from brand_matches

    union all

    select
      id,
      label,
      domain,
      lexical_score
        + (trigram_score * 1000.0) as score
    from creative_matches
  ),

  deduped as (
    select
      max(id) as id,
      max(label) as label,
      max(domain) as domain,
      max(score) as score

    from combined

    where label is not null

    group by lower(trim(label))
  )

  select
    id,
    label,
    domain,
    score

  from deduped

  order by
    score desc,
    label asc

  limit (
    select result_limit
    from input
  );
$$;

revoke all
on function public.adspy_autocomplete_advertisers(
  text,
  text,
  integer
)
from public;

grant execute
on function public.adspy_autocomplete_advertisers(
  text,
  text,
  integer
)
to authenticated;

grant execute
on function public.adspy_autocomplete_advertisers(
  text,
  text,
  integer
)
to service_role;