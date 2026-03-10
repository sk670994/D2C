# D2C Marketing SaaS Tool

Input-first calculator (no Excel upload required).

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and start with the calculator dashboard.

## Product Flow

1. Fill input cells (blue) in the dashboard.
2. Click `Apply Changes`.
3. Review all computed sections:
   - Unit Economics
   - Ad Metrics
   - Scale Planner
   - Monthly P&L
4. Click `Generate AI Insights` for LLM recommendations.

## Authentication (Supabase Email/Password)

1. Create a Supabase project.
2. In Supabase Auth settings, enable Email provider.
3. Set environment variables in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Protected route:
- `/dashboard` (redirects to `/login` if not authenticated)

## Monthly Records (Supabase)

Create tables in Supabase SQL editor:

```sql
create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  user_email text not null,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  user_email text not null,
  month_key text,
  latest_report_input jsonb,
  latest_report_data jsonb,
  scenarios jsonb,
  selected_scenario_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text not null,
  month_key text not null,
  report_input jsonb not null,
  report_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, month_key)
);

alter table public.monthly_records enable row level security;

create policy "user_can_read_own_records"
on public.monthly_records
for select
to authenticated
using (auth.uid() = user_id);

create policy "user_can_upsert_own_records"
on public.monthly_records
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "user_can_update_own_records"
on public.monthly_records
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.user_profiles enable row level security;
alter table public.user_workspaces enable row level security;

create policy "user_can_read_own_profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "user_can_upsert_own_profile"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "user_can_update_own_profile"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_can_read_own_workspace"
on public.user_workspaces
for select
to authenticated
using (auth.uid() = user_id);

create policy "user_can_upsert_own_workspace"
on public.user_workspaces
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "user_can_update_own_workspace"
on public.user_workspaces
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_user_workspaces_updated_at on public.user_workspaces;
create trigger trg_user_workspaces_updated_at
before update on public.user_workspaces
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_monthly_records_updated_at on public.monthly_records;
create trigger trg_monthly_records_updated_at
before update on public.monthly_records
for each row execute procedure public.set_updated_at();
```

Admin lookup endpoints:
- `GET /api/admin/monthly-records?email=user@example.com`
- `GET /api/admin/users?email=user@example.com&limit=50`
- Requires:
  - `NEXT_PUBLIC_ADMIN_EMAIL`
  - `SUPABASE_SERVICE_ROLE_KEY`

Runtime persistence now includes:
- profile fields (`full_name`, `phone`) in `user_profiles`
- latest workspace draft and scenarios in `user_workspaces`
- monthly historical records in `monthly_records`

## Gemini LLM Insights

1. Create a Google AI Studio API key.
2. Copy `.env.example` to `.env.local` and set:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (example: `gemini-1.5-flash`)
   - `GEMINI_TIMEOUT_MS` (optional, default `25000`)

If Gemini is unavailable, the app falls back to local rule-based insights.
