-- Brand Vault Pro (v1): economics on the vault, 3 competitor slots, saved actions.
-- Idempotent: safe to run again if it was already applied by hand.
-- Rollback: DROP TABLE brand_vault_saved_actions, brand_vault_competitors;
--           ALTER TABLE brand_vaults DROP COLUMN economics;

BEGIN;


alter table public.brand_vaults
  add column if not exists economics jsonb not null default '{}'::jsonb;

create table if not exists public.brand_vault_competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.brand_vaults(user_id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  name text not null,
  domain text,
  advertiser_page_id text,
  country text not null default 'IN' check (country ~ '^[A-Z]{2}$'),
  platform text not null default 'meta' check (platform = 'meta'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slot),
  unique (user_id, advertiser_page_id)
);

create index if not exists brand_vault_competitors_user_idx
  on public.brand_vault_competitors(user_id, slot);

create index if not exists brand_vault_competitors_page_idx
  on public.brand_vault_competitors(advertiser_page_id)
  where advertiser_page_id is not null;

create table if not exists public.brand_vault_saved_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.brand_vaults(user_id) on delete cascade,
  action_type text not null check (action_type in ('save', 'brief', 'alert')),
  reference_key text not null,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, reference_key)
);

create index if not exists brand_vault_saved_actions_user_idx
  on public.brand_vault_saved_actions(user_id, created_at desc);

alter table public.brand_vault_competitors enable row level security;
alter table public.brand_vault_saved_actions enable row level security;

revoke all on table public.brand_vault_competitors from anon;
revoke all on table public.brand_vault_saved_actions from anon;

grant select, insert, update, delete on table public.brand_vault_competitors to authenticated;
grant select, insert, update, delete on table public.brand_vault_saved_actions to authenticated;
grant all on table public.brand_vault_competitors to service_role;
grant all on table public.brand_vault_saved_actions to service_role;

drop policy if exists "brand vault competitors read own" on public.brand_vault_competitors;
create policy "brand vault competitors read own"
on public.brand_vault_competitors for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "brand vault competitors insert own" on public.brand_vault_competitors;
create policy "brand vault competitors insert own"
on public.brand_vault_competitors for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "brand vault competitors update own" on public.brand_vault_competitors;
create policy "brand vault competitors update own"
on public.brand_vault_competitors for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "brand vault competitors delete own" on public.brand_vault_competitors;
create policy "brand vault competitors delete own"
on public.brand_vault_competitors for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "brand vault saved actions read own" on public.brand_vault_saved_actions;
create policy "brand vault saved actions read own"
on public.brand_vault_saved_actions for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "brand vault saved actions insert own" on public.brand_vault_saved_actions;
create policy "brand vault saved actions insert own"
on public.brand_vault_saved_actions for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "brand vault saved actions update own" on public.brand_vault_saved_actions;
create policy "brand vault saved actions update own"
on public.brand_vault_saved_actions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "brand vault saved actions delete own" on public.brand_vault_saved_actions;
create policy "brand vault saved actions delete own"
on public.brand_vault_saved_actions for delete to authenticated
using ((select auth.uid()) = user_id);


INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260926010000', 'brand_vault_pro_v1')
ON CONFLICT DO NOTHING;

COMMIT;
