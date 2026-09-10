-- Durable decision, experiment, and agency foundations.

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'analyst', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('SCALE', 'HOLD', 'FIX', 'TEST')),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  title TEXT NOT NULL,
  action TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_impact TEXT NOT NULL DEFAULT '',
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_as_of TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  recommendation_id UUID REFERENCES public.recommendations(id) ON DELETE SET NULL,
  hypothesis TEXT NOT NULL,
  control TEXT NOT NULL,
  variant TEXT NOT NULL,
  primary_metric TEXT NOT NULL,
  guardrail TEXT,
  budget NUMERIC,
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 365),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'won', 'lost', 'paused')),
  baseline_value NUMERIC,
  result_value NUMERIC,
  outcome_note TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recommendations_user_created ON public.recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_experiments_user_updated ON public.experiments(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON public.organization_members(user_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_owner_access ON public.organizations;
CREATE POLICY organization_owner_access ON public.organizations FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS organization_member_access ON public.organization_members;
CREATE POLICY organization_member_access ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.owner_id = auth.uid()));

DROP POLICY IF EXISTS recommendation_owner_access ON public.recommendations;
CREATE POLICY recommendation_owner_access ON public.recommendations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS experiment_owner_access ON public.experiments;
CREATE POLICY experiment_owner_access ON public.experiments FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
