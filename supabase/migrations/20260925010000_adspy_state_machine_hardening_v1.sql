-- AdSpy durable state machine hardening v1
--
-- Root causes fixed (see docs audit 2026-09-25):
--   * Terminal runs (failed/exhausted/cancelled) were made active again by
--     claim / fail / reap, violating adspy_runs_one_active_collection_idx and
--     rolling back the whole reap ("duplicate key ... one_active_collection").
--   * Claim's lease takeover ignored max_attempts, so a request that always
--     times out was re-run on every queue delivery.
--   * fail_request overwrote requests that were already completed/failed.
--   * Requests of runs failed by stale recovery stayed queued/retrying forever
--     (22 such rows in production on 2026-09-25, oldest 2026-09-15).
--
-- Rule enforced everywhere below: a run/request status only moves out of an
-- ACTIVE state (queued, running, retrying). Terminal rows are never reopened.
-- Function signatures are unchanged, so the deployed app keeps working.

BEGIN;

-- 1) One-time cleanup: close requests whose run already finished.
UPDATE public.adspy_requests q
SET status = 'cancelled',
    last_error = coalesce(q.last_error, 'Run already finished; request closed by hardening migration.'),
    locked_at = NULL,
    locked_by = NULL,
    updated_at = now()
FROM public.adspy_runs r
WHERE r.id = q.run_id
  AND q.status IN ('queued', 'running', 'retrying')
  AND r.status NOT IN ('queued', 'running', 'retrying');


-- 2) Claim: only for an active run, honour max_attempts, never reopen runs.
CREATE OR REPLACE FUNCTION public.adspy_claim_request(
  p_request_id uuid,
  p_worker_id text,
  p_lease_seconds integer DEFAULT 300
)
RETURNS public.adspy_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_request public.adspy_requests;
  v_run_status text;
begin
  select * into v_request
  from public.adspy_requests
  where id = p_request_id
  for update skip locked;

  if not found then
    return null; -- missing, or another worker holds the row right now
  end if;

  select status into v_run_status from public.adspy_runs where id = v_request.run_id;

  -- Parent run finished: this request can never do useful work.
  if v_run_status is null or v_run_status not in ('queued','running','retrying') then
    if v_request.status in ('queued','running','retrying') then
      update public.adspy_requests
      set status = 'cancelled',
          last_error = coalesce(last_error, 'Run already finished.'),
          locked_at = null, locked_by = null, updated_at = now()
      where id = v_request.id;
    end if;
    return null;
  end if;

  -- Expired lease: take over only if attempts remain, otherwise fail it.
  if v_request.status = 'running'
     and v_request.locked_at is not null
     and v_request.locked_at < now() - make_interval(secs => greatest(30, p_lease_seconds)) then
    if v_request.attempt >= v_request.max_attempts then
      update public.adspy_requests
      set status = 'failed',
          last_error = 'Worker lease expired on the final attempt.',
          locked_at = null, locked_by = null, updated_at = now()
      where id = v_request.id;

      update public.adspy_runs
      set status = 'failed', stage = 'failed',
          error_message = 'Worker lease expired on the final attempt.',
          completed_at = now(), updated_at = now()
      where id = v_request.run_id and status in ('queued','running','retrying');

      perform public.adspy_refresh_run_counters(v_request.run_id);
      return null;
    end if;

    update public.adspy_requests
    set status = 'retrying', locked_at = null, locked_by = null, available_at = now(), updated_at = now()
    where id = v_request.id
    returning * into v_request;
  end if;

  if v_request.status not in ('queued','retrying')
     or v_request.available_at > now()
     or v_request.attempt >= v_request.max_attempts then
    return null;
  end if;

  update public.adspy_requests
  set status = 'running',
      attempt = attempt + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
  where id = v_request.id
  returning * into v_request;

  update public.adspy_runs
  set status = 'running',
      stage = case when v_request.request_type = 'initial' then 'meta_quick' else 'meta_deep' end,
      heartbeat_at = now(),
      attempt = greatest(attempt, v_request.attempt),
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = v_request.run_id
    and status in ('queued','running','retrying');

  perform public.adspy_refresh_run_counters(v_request.run_id);
  return v_request;
end;
$function$;


-- 3) Fail: terminal requests are returned unchanged; runs only change while active.
CREATE OR REPLACE FUNCTION public.adspy_fail_request(
  p_request_id uuid,
  p_error_message text,
  p_retryable boolean DEFAULT true
)
RETURNS public.adspy_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  if v_request.status not in ('queued','running','retrying') then
    return v_request; -- already completed/failed/cancelled: never reopen
  end if;

  if p_retryable and v_request.attempt < v_request.max_attempts then
    update public.adspy_requests
    set status = 'retrying',
        available_at = now() + make_interval(
          secs => least(900, greatest(5, power(2, v_request.attempt)::integer * 5))
        ),
        last_error = left(coalesce(p_error_message, 'Unknown request failure'), 4000),
        locked_at = null, locked_by = null, updated_at = now()
    where id = v_request.id
    returning * into v_request;
  else
    update public.adspy_requests
    set status = 'failed',
        last_error = left(coalesce(p_error_message, 'Unknown request failure'), 4000),
        locked_at = null, locked_by = null, updated_at = now()
    where id = v_request.id
    returning * into v_request;
  end if;

  perform public.adspy_refresh_run_counters(v_request.run_id);

  update public.adspy_runs
  set status = case when v_request.status = 'failed' then 'failed' else 'retrying' end,
      stage = case when v_request.status = 'failed' then 'failed' else 'retrying' end,
      error_message = case when v_request.status = 'failed' then v_request.last_error else null end,
      completed_at = case when v_request.status = 'failed' then now() else completed_at end,
      heartbeat_at = now(),
      updated_at = now()
  where id = v_request.run_id
    and status in ('queued','running','retrying');

  return v_request;
end;
$function$;


-- 4) Finish run: only from an active state (idempotent otherwise).
CREATE OR REPLACE FUNCTION public.adspy_finish_run(
  p_run_id uuid,
  p_status text,
  p_error_message text DEFAULT NULL::text
)
RETURNS public.adspy_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_run public.adspy_runs;
begin
  update public.adspy_runs
  set status = p_status,
      stage = p_status,
      error_message = p_error_message,
      completed_at = case when p_status in ('exhausted','failed','cancelled') then now() else completed_at end,
      heartbeat_at = now(),
      updated_at = now()
  where id = p_run_id
    and status in ('queued','running','retrying');

  select * into v_run from public.adspy_runs where id = p_run_id;
  if not found then
    raise exception 'AdSpy run % not found', p_run_id;
  end if;

  -- A finished run has no work left: close its open requests.
  if v_run.status in ('exhausted','failed','cancelled') then
    update public.adspy_requests
    set status = 'cancelled',
        last_error = coalesce(last_error, 'Run finished before this request ran.'),
        locked_at = null, locked_by = null, updated_at = now()
    where run_id = p_run_id
      and status in ('queued','retrying');
  end if;

  perform public.adspy_refresh_run_counters(p_run_id);
  select * into v_run from public.adspy_runs where id = p_run_id;
  return v_run;
end;
$function$;


-- 5) Reap: expire leases, then update ONLY the affected runs that are still active.
CREATE OR REPLACE FUNCTION public.adspy_reap_expired_requests(p_lease_seconds integer DEFAULT 300)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_count integer;
  v_runs uuid[];
begin
  with expired as (
    select q.id
    from public.adspy_requests q
    where q.status = 'running'
      and q.locked_at is not null
      and q.locked_at < now() - make_interval(secs => greatest(30, p_lease_seconds))
    for update skip locked
  ),
  updated as (
    update public.adspy_requests q
    set status = case when q.attempt < q.max_attempts then 'retrying' else 'failed' end,
        available_at = case
          when q.attempt < q.max_attempts
          then now() + make_interval(secs => least(900, greatest(10, power(2, q.attempt)::integer * 5)))
          else q.available_at
        end,
        last_error = 'Worker lease expired before request completion.',
        locked_at = null, locked_by = null, updated_at = now()
    from expired e
    where q.id = e.id
    returning q.run_id
  )
  select array_agg(distinct run_id), count(*) into v_runs, v_count from updated;

  if v_runs is not null then
    update public.adspy_runs r
    set status = case
          when exists (select 1 from public.adspy_requests q where q.run_id = r.id and q.status = 'failed') then 'failed'
          else 'retrying'
        end,
        stage = case
          when exists (select 1 from public.adspy_requests q where q.run_id = r.id and q.status = 'failed') then 'failed'
          else 'retrying'
        end,
        completed_at = case
          when exists (select 1 from public.adspy_requests q where q.run_id = r.id and q.status = 'failed') then now()
          else r.completed_at
        end,
        updated_at = now()
    where r.id = any (v_runs)
      and r.status in ('queued','running','retrying');
  end if;

  -- Requests orphaned by runs that finished elsewhere.
  update public.adspy_requests q
  set status = 'cancelled',
      last_error = coalesce(q.last_error, 'Run already finished.'),
      locked_at = null, locked_by = null, updated_at = now()
  from public.adspy_runs r
  where r.id = q.run_id
    and q.status in ('queued','retrying')
    and r.status not in ('queued','running','retrying');

  return coalesce(v_count, 0);
end;
$function$;

COMMIT;

-- Rollback: re-apply the function bodies from
-- 20260915220000_adspy_durable_runs_v2.sql (signatures are identical).
-- The cleanup in step 1 only closed requests of already-finished runs.
