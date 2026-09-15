begin;

create table if not exists public.adspy_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_job_id uuid not null references public.ad_intelligence_collection_jobs(id) on delete cascade,
  collection_key text not null,
  query text not null,
  country text not null,
  platform text not null,
  mode text not null,
  advertiser_page_id text,
  status text not null default 'queued'
    check (status in ('queued','running','retrying','exhausted','failed','cancelled')),
  stage text not null default 'queued',
  discovered_ads integer not null default 0,
  normalized_ads integer not null default 0,
  persisted_ads integer not null default 0,
  queued_requests integer not null default 0,
  running_requests integer not null default 0,
  completed_requests integer not null default 0,
  failed_requests integer not null default 0,
  attempt integer not null default 0,
  heartbeat_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists adspy_runs_one_active_collection_idx
on public.adspy_runs(collection_key)
where status in ('queued','running','retrying');

create index if not exists adspy_runs_job_idx
on public.adspy_runs(collection_job_id, created_at desc);

create index if not exists adspy_runs_heartbeat_idx
on public.adspy_runs(status, heartbeat_at desc);

create table if not exists public.adspy_requests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.adspy_runs(id) on delete cascade,
  unique_key text not null,
  request_type text not null
    check (request_type in ('initial','deep')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','running','retrying','completed','failed','cancelled')),
  attempt integer not null default 0,
  max_attempts integer not null default 5,
  priority integer not null default 100,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(run_id, unique_key)
);

create index if not exists adspy_requests_claim_idx
on public.adspy_requests(status, available_at, priority desc, created_at);

create index if not exists adspy_requests_lease_idx
on public.adspy_requests(status, locked_at)
where status = 'running';

create or replace function public.adspy_refresh_run_counters(p_run_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.adspy_runs r
  set
    queued_requests = (
      select count(*) from public.adspy_requests q
      where q.run_id = r.id and q.status in ('queued','retrying')
    ),
    running_requests = (
      select count(*) from public.adspy_requests q
      where q.run_id = r.id and q.status = 'running'
    ),
    completed_requests = (
      select count(*) from public.adspy_requests q
      where q.run_id = r.id and q.status = 'completed'
    ),
    failed_requests = (
      select count(*) from public.adspy_requests q
      where q.run_id = r.id and q.status = 'failed'
    ),
    updated_at = now()
  where r.id = p_run_id;
$$;

create or replace function public.adspy_get_or_create_run(
  p_user_id uuid,
  p_collection_job_id uuid,
  p_collection_key text,
  p_query text,
  p_country text,
  p_platform text,
  p_mode text,
  p_advertiser_page_id text default null
)
returns public.adspy_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.adspy_runs;
begin
  select *
  into v_run
  from public.adspy_runs
  where collection_key = p_collection_key
    and status in ('queued','running','retrying')
  order by created_at desc
  limit 1;

  if found then
    return v_run;
  end if;

  begin
    insert into public.adspy_runs (
      user_id,
      collection_job_id,
      collection_key,
      query,
      country,
      platform,
      mode,
      advertiser_page_id,
      status,
      stage,
      heartbeat_at,
      started_at
    )
    values (
      p_user_id,
      p_collection_job_id,
      p_collection_key,
      p_query,
      p_country,
      p_platform,
      p_mode,
      p_advertiser_page_id,
      'queued',
      'queued',
      now(),
      now()
    )
    returning * into v_run;
  exception
    when unique_violation then
      select *
      into v_run
      from public.adspy_runs
      where collection_key = p_collection_key
        and status in ('queued','running','retrying')
      order by created_at desc
      limit 1;
  end;

  if not found then
    raise exception 'Unable to create or resume AdSpy run for %', p_collection_key;
  end if;

  return v_run;
end;
$$;

create or replace function public.adspy_enqueue_request(
  p_run_id uuid,
  p_unique_key text,
  p_request_type text,
  p_payload jsonb,
  p_priority integer default 100,
  p_max_attempts integer default 5
)
returns public.adspy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.adspy_requests;
begin
  insert into public.adspy_requests (
    run_id,
    unique_key,
    request_type,
    payload,
    priority,
    max_attempts
  )
  values (
    p_run_id,
    p_unique_key,
    p_request_type,
    coalesce(p_payload, '{}'::jsonb),
    p_priority,
    greatest(1, p_max_attempts)
  )
  on conflict (run_id, unique_key)
  do update set updated_at = now()
  returning * into v_request;

  perform public.adspy_refresh_run_counters(p_run_id);

  update public.adspy_runs
  set
    status = case when status = 'exhausted' then 'queued' else status end,
    heartbeat_at = now(),
    updated_at = now()
  where id = p_run_id;

  return v_request;
end;
$$;

create or replace function public.adspy_claim_request(
  p_request_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns public.adspy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.adspy_requests;
begin
  update public.adspy_requests
  set
    status = 'retrying',
    locked_at = null,
    locked_by = null,
    updated_at = now()
  where id = p_request_id
    and status = 'running'
    and locked_at is not null
    and locked_at < now() - make_interval(secs => greatest(30, p_lease_seconds));

  select *
  into v_request
  from public.adspy_requests
  where id = p_request_id
    and status in ('queued','retrying')
    and available_at <= now()
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.adspy_requests
  set
    status = 'running',
    attempt = attempt + 1,
    locked_at = now(),
    locked_by = p_worker_id,
    updated_at = now()
  where id = v_request.id
  returning * into v_request;

  update public.adspy_runs
  set
    status = 'running',
    stage = case when v_request.request_type = 'initial'
      then 'meta_quick'
      else 'meta_deep'
    end,
    heartbeat_at = now(),
    attempt = greatest(attempt, v_request.attempt),
    started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = v_request.run_id;

  perform public.adspy_refresh_run_counters(v_request.run_id);

  return v_request;
end;
$$;

create or replace function public.adspy_heartbeat(
  p_run_id uuid,
  p_request_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.adspy_runs
  set heartbeat_at = now(), updated_at = now()
  where id = p_run_id
    and status in ('queued','running','retrying');

  if p_request_id is not null then
    update public.adspy_requests
    set locked_at = now(), updated_at = now()
    where id = p_request_id and status = 'running';
  end if;
end;
$$;

create or replace function public.adspy_complete_request(
  p_request_id uuid,
  p_result jsonb default '{}'::jsonb
)
returns public.adspy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.adspy_requests;
begin
  update public.adspy_requests
  set
    status = 'completed',
    result = coalesce(p_result, '{}'::jsonb),
    locked_at = null,
    locked_by = null,
    completed_at = now(),
    updated_at = now()
  where id = p_request_id and status = 'running'
  returning * into v_request;

  if not found then
    raise exception 'AdSpy request % is not running or no longer exists', p_request_id;
  end if;

  perform public.adspy_refresh_run_counters(v_request.run_id);
  return v_request;
end;
$$;

create or replace function public.adspy_fail_request(
  p_request_id uuid,
  p_error_message text,
  p_retryable boolean default true
)
returns public.adspy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.adspy_requests;
begin
  select * into v_request
  from public.adspy_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'AdSpy request % not found', p_request_id;
  end if;

  if p_retryable and v_request.attempt < v_request.max_attempts then
    update public.adspy_requests
    set
      status = 'retrying',
      available_at = now() + make_interval(
        secs => least(900, greatest(5, power(2, v_request.attempt)::integer * 5))
      ),
      last_error = left(coalesce(p_error_message, 'Unknown request failure'), 4000),
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = v_request.id
    returning * into v_request;
  else
    update public.adspy_requests
    set
      status = 'failed',
      last_error = left(coalesce(p_error_message, 'Unknown request failure'), 4000),
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = v_request.id
    returning * into v_request;
  end if;

  perform public.adspy_refresh_run_counters(v_request.run_id);

  update public.adspy_runs
  set
    status = case
      when v_request.status = 'retrying' then 'retrying'
      when v_request.status = 'failed' then 'failed'
      else status
    end,
    error_message = case
      when v_request.status = 'failed' then v_request.last_error
      else null
    end,
    heartbeat_at = now(),
    updated_at = now()
  where id = v_request.run_id;

  return v_request;
end;
$$;

create or replace function public.adspy_finish_run(
  p_run_id uuid,
  p_status text,
  p_error_message text default null
)
returns public.adspy_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.adspy_runs;
begin
  update public.adspy_runs
  set
    status = p_status,
    stage = p_status,
    error_message = p_error_message,
    completed_at = case
      when p_status in ('exhausted','failed','cancelled') then now()
      else completed_at
    end,
    heartbeat_at = now(),
    updated_at = now()
  where id = p_run_id
  returning * into v_run;

  if not found then
    raise exception 'AdSpy run % not found', p_run_id;
  end if;

  perform public.adspy_refresh_run_counters(p_run_id);

  select * into v_run
  from public.adspy_runs
  where id = p_run_id;

  return v_run;
end;
$$;

create or replace function public.adspy_reap_expired_requests(
  p_lease_seconds integer default 300
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    select id
    from public.adspy_requests
    where status = 'running'
      and locked_at is not null
      and locked_at < now() - make_interval(
        secs => greatest(30, p_lease_seconds)
      )
    for update skip locked
  )
  update public.adspy_requests q
  set
    status = case
      when q.attempt < q.max_attempts then 'retrying'
      else 'failed'
    end,
    available_at = case
      when q.attempt < q.max_attempts
      then now() + make_interval(
        secs => least(
          900,
          greatest(10, power(2, q.attempt)::integer * 5)
        )
      )
      else q.available_at
    end,
    last_error = 'Worker lease expired before request completion.',
    locked_at = null,
    locked_by = null,
    updated_at = now()
  from expired e
  where q.id = e.id;

  get diagnostics v_count = row_count;

  update public.adspy_runs r
  set
    status = case
      when exists (
        select 1
        from public.adspy_requests q
        where q.run_id = r.id and q.status = 'failed'
      ) then 'failed'
      when exists (
        select 1
        from public.adspy_requests q
        where q.run_id = r.id and q.status in ('retrying','running')
      ) then 'retrying'
      else r.status
    end,
    updated_at = now()
  where r.id in (
    select distinct run_id
    from public.adspy_requests
    where status in ('retrying','failed')
  );

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.adspy_get_or_create_run(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.adspy_enqueue_request(uuid,text,text,jsonb,integer,integer) to service_role;
grant execute on function public.adspy_claim_request(uuid,text,integer) to service_role;
grant execute on function public.adspy_heartbeat(uuid,uuid) to service_role;
grant execute on function public.adspy_complete_request(uuid,jsonb) to service_role;
grant execute on function public.adspy_fail_request(uuid,text,boolean) to service_role;
grant execute on function public.adspy_finish_run(uuid,text,text) to service_role;
grant execute on function public.adspy_reap_expired_requests(integer) to service_role;

commit;