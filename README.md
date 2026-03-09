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

Create a table in Supabase SQL editor:

```sql
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
```

Admin lookup endpoint:
- `GET /api/admin/monthly-records?email=user@example.com`
- Requires:
  - `NEXT_PUBLIC_ADMIN_EMAIL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Gemini LLM Insights

1. Create a Google AI Studio API key.
2. Copy `.env.example` to `.env.local` and set:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (example: `gemini-1.5-flash`)
   - `GEMINI_TIMEOUT_MS` (optional, default `25000`)

If Gemini is unavailable, the app falls back to local rule-based insights.
