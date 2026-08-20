-- Add tables for Meta and Google Ads integrations

-- Table for connected ad accounts
CREATE TABLE IF NOT EXISTS ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  account_id TEXT NOT NULL,
  account_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform, account_id)
);

-- Table for ad metrics (time-series data)
CREATE TABLE IF NOT EXISTS ad_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  ad_id TEXT,
  ad_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  ctr DECIMAL(5,2) DEFAULT 0,
  cpc DECIMAL(10,2) DEFAULT 0,
  roas DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform, campaign_id, date)
);

-- Safe upgrades for projects where the tables already exist
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE ad_metrics ADD COLUMN IF NOT EXISTS ad_id TEXT;
ALTER TABLE ad_metrics ADD COLUMN IF NOT EXISTS ad_name TEXT;
ALTER TABLE ad_metrics ADD COLUMN IF NOT EXISTS adset_id TEXT;
ALTER TABLE ad_metrics ADD COLUMN IF NOT EXISTS adset_name TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ad_accounts_user_platform ON ad_accounts(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_user_date ON ad_metrics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_campaign_date ON ad_metrics(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_ad_date ON ad_metrics(ad_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_metrics_unique_ad_date
ON ad_metrics(user_id, platform, ad_id, date);

-- Enable RLS
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_metrics ENABLE ROW LEVEL SECURITY;

-- Policies for ad_accounts
CREATE POLICY "user_can_read_own_ad_accounts"
ON ad_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "user_can_insert_own_ad_accounts"
ON ad_accounts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_can_update_own_ad_accounts"
ON ad_accounts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for ad_metrics
CREATE POLICY "user_can_read_own_ad_metrics"
ON ad_metrics
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "user_can_insert_own_ad_metrics"
ON ad_metrics
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ad_accounts_updated_at
BEFORE UPDATE ON ad_accounts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
