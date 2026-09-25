-- Hawky-style AdSpy context graph.
-- Uses existing ad_intelligence_creatives / observations as source-of-truth.
-- The new tables are application-internal; anon/authenticated roles receive no access.

create table if not exists public.adspy_context_nodes (
  id uuid primary key default gen_random_uuid(),
  node_type text not null,
  node_key text not null unique,
  label text not null,
  payload jsonb not null default '{}'::jsonb,
  importance real not null default 0.5 check (importance >= 0 and importance <= 1),
  confidence real not null default 0.5 check (confidence >= 0 and confidence <= 1),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adspy_context_nodes_type_idx on public.adspy_context_nodes(node_type);
create index if not exists adspy_context_nodes_label_trgm_idx on public.adspy_context_nodes using gin (label gin_trgm_ops);
create index if not exists adspy_context_nodes_last_seen_idx on public.adspy_context_nodes(last_seen_at desc);

create table if not exists public.adspy_context_edges (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references public.adspy_context_nodes(id) on delete cascade,
  to_node_id uuid not null references public.adspy_context_nodes(id) on delete cascade,
  relation text not null,
  weight real not null default 1 check (weight >= 0 and weight <= 1),
  evidence_count integer not null default 1 check (evidence_count >= 1),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(from_node_id, to_node_id, relation)
);

create index if not exists adspy_context_edges_from_idx on public.adspy_context_edges(from_node_id);
create index if not exists adspy_context_edges_to_idx on public.adspy_context_edges(to_node_id);
create index if not exists adspy_context_edges_relation_idx on public.adspy_context_edges(relation);

-- Keep the graph server-side only. Existing application service-role code bypasses RLS.
alter table public.adspy_context_nodes disable row level security;
alter table public.adspy_context_edges disable row level security;
revoke all on table public.adspy_context_nodes from anon, authenticated;
revoke all on table public.adspy_context_edges from anon, authenticated;
grant all on table public.adspy_context_nodes to service_role;
grant all on table public.adspy_context_edges to service_role;

create or replace function public.adspy_context_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists adspy_context_nodes_touch on public.adspy_context_nodes;
create trigger adspy_context_nodes_touch before update on public.adspy_context_nodes for each row execute function public.adspy_context_touch_updated_at();
drop trigger if exists adspy_context_edges_touch on public.adspy_context_edges;
create trigger adspy_context_edges_touch before update on public.adspy_context_edges for each row execute function public.adspy_context_touch_updated_at();
