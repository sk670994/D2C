# Complete Testing & Validation Guide

## Phase 1: Local Development Testing

### 1.1 Environment Setup
- [ ] Copy `.env.example` to `.env.local` (if not already done)
- [ ] Add all required env vars:
  ```
  NEXT_PUBLIC_SUPABASE_URL=your_url
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
  SUPABASE_SERVICE_ROLE_KEY=your_key
  GEMINI_API_KEY=your_key
  GEMINI_MODEL=models/gemini-2.5-flash
  NEXT_PUBLIC_ADMIN_EMAIL=your_email
  META_APP_ID=your_meta_app_id
  META_APP_SECRET=your_meta_app_secret
  GOOGLE_CLIENT_ID=your_google_client_id
  GOOGLE_CLIENT_SECRET=your_google_client_secret
  CRON_SECRET=your_random_secret
  ```
- [ ] Verify Supabase connection: `npm run dev` and check console for errors

### 1.2 Build Validation
```bash
# Clear build cache
rm -r .next

# Run production build
npm run build

# Expected: ✓ Build successful, no errors
```
- [ ] No TypeScript errors
- [ ] All imports resolve correctly
- [ ] Bundle size reasonable

### 1.3 Local Dev Server
```bash
npm run dev
```
- [ ] App starts without errors
- [ ] Console has no critical errors
- [ ] Access http://localhost:3000
- [ ] Page loads with styling

---

## Phase 2: Authentication Flow Testing

### 2.1 Supabase Auth Setup
- [ ] Supabase project created
- [ ] Auth providers enabled (Google, Email)
- [ ] Redirect URLs configured:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/callback` (repeat)
- [ ] Run migrations: `supabase migration up` or use dashboard

### 2.2 Sign-In Flow
```
Test Flow: Login Page → Auth → Dashboard
```
- [ ] Visit `/login` page
- [ ] Sign in with Google works
- [ ] Sign in with email/password works
- [ ] Redirect to dashboard after auth
- [ ] User email displays in dashboard
- [ ] Logout button works
- [ ] Redirect to login after logout

### 2.3 User Profile
- [ ] Profile data persists in `user_profiles` table
- [ ] Name and phone saved correctly
- [ ] RLS policies prevent cross-user access

---

## Phase 3: Core Dashboard Testing

### 3.1 Calculator Sections
Test each section by entering sample data:

**Unit Economics**
- [ ] Enter selling price, discount, GST
- [ ] Enter COGS components (materials, packaging, etc.)
- [ ] Click "Apply Unit Economics Changes"
- [ ] Verify outputs update:
  - Net Revenue per Order
  - Total COGS
  - Gross Margin
  - Contribution Margin
  - Contribution Margin %

**Ad Metrics**
- [ ] Enter total ad spend, impressions, clicks, orders
- [ ] Click "Apply Ad Metrics Changes"
- [ ] Verify outputs:
  - Blended ROAS
  - Blended CAC
  - CTR, CVR, CPC, CPM

**Scale Planner**
- [ ] Set growth targets and allocations
- [ ] Verify total allocation shows 100%
- [ ] Click "Apply Scale Planner Changes"
- [ ] Check scale verdict displays

**Monthly P&L**
- [ ] View auto-derived metrics
- [ ] Verify profit/margin calculations

### 3.2 AI Insights
- [ ] Click "Generate AI Insights"
- [ ] Wait for response (should complete within 30s)
- [ ] Check insights display:
  - Summary paragraph
  - Priority fixes list
  - Growth levers
  - Risk alerts
  - Channel plan
  - Experiment backlog

### 3.3 Data Persistence
- [ ] Make changes to input data
- [ ] Refresh page
- [ ] Verify data persists (loaded from database)
- [ ] Check "All Saved" badge appears

### 3.4 Scenario Management
- [ ] Enter data and click "Save Scenario"
- [ ] Create multiple scenarios
- [ ] View scenarios in Scenario Lab
- [ ] Switch between scenarios
- [ ] Verify data changes per scenario

---

## Phase 4: Brand Vault Testing

### 4.1 Brand Vault Page
```
Route: /brand-vault
```
- [ ] Page loads without errors
- [ ] Form fields visible (brand name, tone, audience, etc.)
- [ ] Fill all fields with test data
- [ ] Click Save
- [ ] Data persists on refresh

### 4.2 Brand Vault Integration
- [ ] Go to dashboard
- [ ] Check "Brand Vault" badge shows "Complete"
- [ ] Generate insights with brand data
- [ ] Verify insights reference brand context

---

## Phase 5: Ad Integration Testing

### 5.1 Database Setup
```bash
# Execute SQL in Supabase SQL Editor
supabase-schema.sql
```
- [ ] `ad_accounts` table created
- [ ] `ad_metrics` table created
- [ ] RLS policies applied
- [ ] Indexes created

### 5.2 Meta Ads Connection
**Setup Requirements:**
- [ ] Meta App ID set in env
- [ ] Meta App Secret set in env
- [ ] Redirect URI configured in Meta app settings

**Test Flow:**
- [ ] Go to dashboard "Ad Performance" section
- [ ] Click "Connect Meta Ads"
- [ ] Redirected to Meta login
- [ ] Authorize app
- [ ] Return to dashboard
- [ ] "Connected" badge shows on Ad Performance section
- [ ] Account ID displays

### 5.3 Google Ads Connection
**Setup Requirements:**
- [ ] Google Client ID set in env
- [ ] Google Client Secret set in env
- [ ] Developer Token set in env
- [ ] OAuth redirect URI configured

**Test Flow:**
- [ ] Click "Connect Google Ads"
- [ ] Redirected to Google login
- [ ] Authorize app
- [ ] Return to dashboard
- [ ] Account connected

### 5.4 Ad Metrics Display
- [ ] After connecting accounts, "Recent Metrics" table appears
- [ ] Campaign data displays (campaign name, spend, ROAS)
- [ ] Multiple campaigns show if available
- [ ] Disconnect and reconnect to verify

### 5.5 Cron Job Testing
```bash
# Manual test (local):
curl -X GET http://localhost:3000/api/cron/fetch-ad-data \
  -H "Authorization: Bearer $CRON_SECRET"

# Expected response:
{
  "totalAccounts": X,
  "processed": X,
  "errors": 0,
  "details": [...]
}
```
- [ ] Cron secret validation works
- [ ] Metrics fetched successfully
- [ ] Data stored in `ad_metrics` table
- [ ] Check Supabase dashboard

---

## Phase 6: API Route Testing

### 6.1 Health Check
```bash
curl http://localhost:3000/api/health
```
- [ ] Returns 200 OK

### 6.2 Insights API
```bash
curl -X POST http://localhost:3000/api/insights \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "unitEconomics": {...},
    "adMetrics": {...},
    ...
  }'
```
- [ ] Returns insights JSON
- [ ] Includes ad metrics context if available

### 6.3 Brand Vault API
```bash
curl http://localhost:3000/api/brand-vault \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- [ ] Returns brand vault data
- [ ] Returns empty if not set

### 6.4 Integration Endpoints
```bash
# Meta accounts
curl http://localhost:3000/api/integrations/meta-ads/accounts \
  -H "Authorization: Bearer YOUR_TOKEN"

# Google accounts
curl http://localhost:3000/api/integrations/google-ads/accounts \
  -H "Authorization: Bearer YOUR_TOKEN"

# Fetch metrics
curl -X POST http://localhost:3000/api/integrations/meta-ads/fetch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"accountId":"act_123456"}'
```
- [ ] All endpoints return correct data
- [ ] Auth validation works
- [ ] Errors handled gracefully

---

## Phase 7: Performance Testing

### 7.1 Page Load Times
Using Chrome DevTools Lighthouse:
- [ ] Homepage: < 3 seconds
- [ ] Dashboard: < 4 seconds
- [ ] Insights generation: < 30 seconds

### 7.2 Database Queries
- [ ] Enable query logging in Supabase
- [ ] Check query performance
- [ ] Verify indexes are used

### 7.3 API Response Times
- [ ] Insights API: < 25 seconds
- [ ] Metrics fetch: < 10 seconds
- [ ] Brand vault: < 1 second

---

## Phase 8: Error Handling & Edge Cases

### 8.1 Auth Errors
- [ ] Expired session handling
- [ ] Invalid token behavior
- [ ] Token refresh works

### 8.2 Data Validation
- [ ] Negative numbers rejected where not allowed
- [ ] Very large numbers handled
- [ ] Missing fields show validation errors

### 8.3 Network Errors
- [ ] Offline mode graceful degradation
- [ ] Retry logic for failed requests
- [ ] Toast notifications for errors

### 8.4 Ad Integration Errors
- [ ] Invalid OAuth token handling
- [ ] API rate limiting
- [ ] Missing account data

---

## Phase 9: Database Testing

### 9.1 User Data Isolation
```sql
-- As User A, verify cannot see User B's data
SELECT * FROM user_workspaces WHERE user_id = 'USER_B_ID';
-- Expected: Returns 0 rows (RLS policy blocks)
```
- [ ] RLS policies enforced
- [ ] Users can only access own data

### 9.2 Data Integrity
- [ ] Ad metrics dates are valid
- [ ] Numeric values are reasonable
- [ ] No orphaned records

### 9.3 Backup & Recovery
- [ ] Supabase automated backups en abled
- [ ] Can restore from backup point
- [ ] No data loss scenarios

---

## Phase 10: Production Deployment Checklist

### 10.1 Before Deploy
- [ ] All tests pass locally
- [ ] No console errors
- [ ] Env vars configured on Vercel
- [ ] Database migrations applied
- [ ] Analytics enabled (optional)

### 10.2 Vercel Deployment
```bash
git push origin dev
```
- [ ] Builds successfully
- [ ] Env vars injected correctly
- [ ] Deploys without errors

### 10.3 Post-Deploy Verification
- [ ] Visit production URL
- [ ] Login works
- [ ] Dashboard loads
- [ ] Insights generate
- [ ] Ad connections work

---

## Phase 11: Monitoring & Logging

### 11.1 Enable Logging
- [ ] Vercel analytics enabled
- [ ] Supabase query logs checked
- [ ] Error logs reviewed

### 11.2 Set Up Alerts
- [ ] Failed API calls alert
- [ ] Database errors alert
- [ ] Build failures notification

### 11.3 Regular Health Checks
- [ ] Weekly: Manual dashboard test
- [ ] Weekly: Check error logs
- [ ] Weekly: Verify cron jobs ran

---

## Quick Test Commands

```bash
# Install dependencies
npm install

# Build production
npm run build

# Start dev server
npm run dev

# Run type check
npx tsc --noEmit

# Format code
npm run format

# View build size
npm run analyze
```

---

## Testing Summary Checklist

| Phase | Category | Status |
|-------|----------|--------|
| 1 | Environment & Build | ⬜ |
| 2 | Authentication | ⬜ |
| 3 | Dashboard Calculator | ⬜ |
| 4 | Brand Vault | ⬜ |
| 5 | Ad Integrations | ⬜ |
| 6 | API Routes | ⬜ |
| 7 | Performance | ⬜ |
| 8 | Error Handling | ⬜ |
| 9 | Database | ⬜ |
| 10 | Production Deploy | ⬜ |
| 11 | Monitoring | ⬜ |

Mark each section as ✅ Complete or ❌ Issue Found

---

## Support Resources

- **Supabase Docs:** https://supabase.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Gemini API:** https://ai.google.dev/docs
- **Meta Ads API:** https://developers.facebook.com/docs/marketing-apis
- **Google Ads API:** https://developers.google.com/google-ads/api/docs

