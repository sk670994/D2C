# Ad Integration Setup Guide

This document outlines the environment variables and configuration needed for the Meta and Google Ads integrations.

## Required Environment Variables

### Meta Ads Integration
```bash
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_ADS_REDIRECT_URI=http://localhost:3000/api/integrations/meta-ads
```

### Google Ads Integration
```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_ADS_REDIRECT_URI=http://localhost:3000/api/integrations/google-ads
GOOGLE_ADS_API_VERSION=v22
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
```

### Public Ad Library / Competitor Discovery
```bash
# Optional. Defaults to META_APP_ID|META_APP_SECRET if not provided.
META_AD_LIBRARY_ACCESS_TOKEN=your_meta_graph_token
```

### Cron Job Security
```bash
CRON_SECRET=your_secure_random_string_for_cron_validation
```

## Setup Instructions

### 1. Meta Ads App Configuration

1. Go to [Meta Developers](https://developers.facebook.com/)
2. Create a new app or use existing one
3. Add "Facebook Login" product
4. Configure OAuth Redirect URIs
5. Get App ID and App Secret from Settings > Basic
6. Copy to .env.local

### 2. Google Ads Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google Ads API
4. Create OAuth 2.0 credentials (Desktop application type)
5. Download credentials JSON
6. Get Developer Token from Google Ads account settings
7. Copy credentials to .env.local

### 3. Database Setup

Run the SQL migration to create tables:

```sql
-- Run supabase-schema.sql in your Supabase project
```

This creates:
- `ad_accounts` - Stores connected ad platform credentials
- `ad_metrics` - Stores time-series ad performance data

### 4. Vercel Cron Configuration

The `vercel.json` file contains cron schedule for fetching ad data:

```json
{
  "crons": [
    {
      "path": "/api/cron/fetch-ad-data",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

This runs every 6 hours. Adjust frequency as needed.

## API Routes Overview

### Meta Ads Endpoints

**POST /api/integrations/meta-ads**
- Initiates OAuth flow for connecting Meta Ads account
- Returns OAuth URL for redirect

**GET /api/integrations/meta-ads** (OAuth callback)
- Handles OAuth callback after user authorization
- Stores access tokens and account info

**GET /api/integrations/meta-ads/accounts**
- Lists all connected Meta Ads accounts for current user
- Requires authentication

**POST /api/integrations/meta-ads/fetch**
- Fetches and stores campaign metrics for a specific account
- Accepts: `accountId`, `datePreset` (last_7d, last_30d, etc.)

### Google Ads Endpoints

**POST /api/integrations/google-ads**
- Initiates OAuth flow for connecting Google Ads account
- Returns OAuth URL for redirect

**GET /api/integrations/google-ads** (OAuth callback)
- Handles OAuth callback after user authorization
- Stores access tokens and customer IDs

**GET /api/integrations/google-ads/accounts**
- Lists all connected Google Ads accounts for current user
- Requires authentication

**POST /api/integrations/google-ads/fetch**
- Fetches and stores campaign performance for a specific account
- Accepts: `accountId`, `dateRange` (LAST_30_DAYS, LAST_7_DAYS, etc.)

### Cron Endpoint

**GET /api/cron/fetch-ad-data**
- Automatically fetches ad data for all connected accounts
- Runs on schedule defined in vercel.json
- Requires `CRON_SECRET` in Authorization header

## Data Flow

1. **User connects ad platform** → OAuth flow → Credentials stored in `ad_accounts`
2. **Cron job runs** → Fetches fresh metrics from each platform → Stores in `ad_metrics`
3. **Dashboard loads** → Queries `ad_metrics` and `ad_accounts` → Displays performance
4. **AI insights generated** → Includes ad metrics data in Gemini prompts → Platform-specific recommendations

## Dashboard Integration

The dashboard has an "Ad Performance" section that:
- Shows connected ad accounts (Meta, Google)
- Displays recent ad-level metrics
- Aggregates spend, ROAS, and impressions by platform
- Provides quick links to connect additional accounts

The dashboard also has an "Ad Library" section that:
- Searches Meta Ad Library through Meta Graph API
- Opens Google Ads Transparency Center for Google public competitor discovery
- Shows public competitor creatives separately from owned-account spend metrics

## Security Considerations

1. **Token Storage**: Access tokens stored encrypted in Supabase (enable encryption at rest)
2. **OAuth Scopes**: Minimal scopes requested (ads_read, ads_management for Meta; adwords scope for Google)
3. **Cron Security**: CRON_SECRET validates requests from Vercel's cron service
4. **Row-Level Security**: RLS policies ensure users only access their own data

## Troubleshooting

### OAuth Flow Fails
- Check redirect URIs match exactly in platform settings
- Verify app credentials in .env.local
- Check browser console for error details

### Metrics Not Showing
- Verify ad accounts are connected (check database)
- Run manual fetch via API to debug
- Check Supabase logs for any errors
- Ensure CRON_SECRET is set for background jobs

### Rate Limiting
- Meta: Burst limit 50/minute, rate limit 500/hour
- Google: Quota-based (check in Google Cloud Console)
- Implement exponential backoff in production

## Testing Integration

Test endpoints locally:

```bash
# Test Meta connection
curl -X POST http://localhost:3000/api/integrations/meta-ads \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test Meta accounts list
curl http://localhost:3000/api/integrations/meta-ads/accounts \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test fetch metrics
curl -X POST http://localhost:3000/api/integrations/meta-ads/fetch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"accountId":"act_123456789"}'
```
