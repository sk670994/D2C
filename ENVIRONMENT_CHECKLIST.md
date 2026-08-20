# Pre-Launch Environment & Configuration Checklist

## 📋 Step 1: Environment Variables Setup

Create `.env.local` file in project root with these variables:

### Supabase Configuration
```bash
# From Supabase Dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI...
```

### AI/LLM Configuration
```bash
# Get from Google AI Studio: https://aistudio.google.com/app/apikeys
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=models/gemini-2.5-flash
GEMINI_TIMEOUT_MS=25000
```

### Application Configuration
```bash
# Your admin email for access control
NEXT_PUBLIC_ADMIN_EMAIL=your-email@company.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Meta Ads Integration
```bash
# From Meta Developers: https://developers.facebook.com
META_APP_ID=123456789
META_APP_SECRET=abcdef1234567890
META_REDIRECT_URI=http://localhost:3000/api/integrations/meta-ads
```

### Google Ads Integration
```bash
# From Google Cloud Console: https://console.cloud.google.com
GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdef
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google-ads
GOOGLE_ADS_DEVELOPER_TOKEN=YOUR_DEVELOPER_TOKEN
```

### Cron Job Security
```bash
# Generate random string for Vercel cron authentication
CRON_SECRET=your-random-secret-string-here-12345
```

---

## 📊 Step 2: Pre-Flight Checklist

Run through these before starting:

### Project Setup
- [ ] Node.js v18+ installed: `node --version`
- [ ] npm v9+ installed: `npm --version`
- [ ] Git repository initialized: `git status`
- [ ] `.env.local` file created with all vars
- [ ] `node_modules` directory exists: `npm install`

### Supabase Setup
- [ ] Supabase project created
- [ ] PostgreSQL database initialized
- [ ] Auth enabled (Google OAuth configured)
- [ ] SQL migration applied (from `supabase-schema.sql`)
- [ ] Tables visible in Supabase dashboard:
  - [ ] `user_profiles`
  - [ ] `user_workspaces`
  - [ ] `brand_vault_entries`
  - [ ] `monthly_records`
  - [ ] `ad_accounts`
  - [ ] `ad_metrics`
- [ ] Row Level Security (RLS) enabled on all tables
- [ ] Indexes created for performance

### Google OAuth Setup
- [ ] Google Cloud Project created
- [ ] OAuth 2.0 credentials generated
- [ ] Redirect URI: `http://localhost:3000/auth/callback`
- [ ] Google Client ID copied to .env
- [ ] Google Client Secret copied to .env

### Meta/Google Ads Setup
- [ ] Meta App created (if using Meta Ads)
- [ ] Google Ads account with developer token (if using Google Ads)
- [ ] OAuth redirect URIs configured
- [ ] Credentials added to .env

### Gemini API Setup
- [ ] Google account with API access
- [ ] API key generated
- [ ] Gemini API enabled in Google Cloud
- [ ] Model name verified: `models/gemini-2.5-flash`

---

## 🔧 Step 3: Initial Setup Commands

Run these in sequence:

```bash
# Install dependencies
npm install

# Check TypeScript compilation
npx tsc --noEmit

# Build for production (dry run)
npm run build

# Clear build cache if needed
rm -rf .next

# Start development server
npm run dev
```

Expected output:
```
✓ Ready in 2.5s
- Local: http://localhost:3000
```

---

## 🧪 Step 4: Quick Validation

### 4.1 Run Validation Script
**Windows PowerShell:**
```powershell
.\validate.ps1
```

**Mac/Linux:**
```bash
bash validate.sh
```

### 4.2 Manual Spot Checks

**Test Build:**
```bash
npm run build
# Should complete without errors
```

**Test TypeScript:**
```bash
npx tsc --noEmit
# Should complete without errors
```

**Test Dev Server:**
```bash
npm run dev
# Should start without errors
```

**Test Auth:**
1. Go to http://localhost:3000/login
2. Click "Sign in with Google"
3. Complete auth flow
4. Should redirect to dashboard

**Test Database:**
1. Go to dashboard
2. Enter sample data
3. Click "Apply Changes"
4. Refresh page
5. Data should persist

---

## 🗂️ Step 5: File Structure Verification

Verify these key files exist:

```
D2C/
├── .env.local                          ✓ Environment variables
├── app/
│   ├── page.tsx                        ✓ Home page
│   ├── layout.tsx                      ✓ Layout
│   ├── globals.css                     ✓ Global styles
│   ├── dashboard/page.tsx              ✓ Main calculator
│   ├── login/page.tsx                  ✓ Auth page
│   ├── brand-vault/page.tsx            ✓ Brand config
│   └── api/
│       ├── insights/route.ts           ✓ AI insights
│       ├── brand-vault/route.ts        ✓ Brand vault API
│       ├── health/route.ts             ✓ Health check
│       ├── integrations/
│       │   ├── meta-ads/route.ts       ✓ Meta OAuth
│       │   ├── meta-ads/accounts/route.ts
│       │   ├── meta-ads/fetch/route.ts
│       │   ├── google-ads/route.ts     ✓ Google OAuth
│       │   ├── google-ads/accounts/route.ts
│       │   └── google-ads/fetch/route.ts
│       └── cron/fetch-ad-data/route.ts ✓ Background job
├── lib/
│   ├── supabase/client.ts              ✓ Supabase client
│   ├── supabase/server.ts              ✓ Supabase server
│   ├── llm/insights.ts                 ✓ AI logic
│   ├── calc/report.ts                  ✓ Calculations
│   └── types/domain.ts                 ✓ TypeScript types
├── components/
│   ├── auth/                           ✓ Auth components
│   ├── dashboard/                      ✓ Dashboard components
│   └── ui/                             ✓ UI components
├── package.json                        ✓ Dependencies
├── tsconfig.json                       ✓ TypeScript config
├── next.config.ts                      ✓ Next.js config
├── vercel.json                         ✓ Vercel config
├── supabase-schema.sql                 ✓ Database schema
├── AD_INTEGRATION_SETUP.md             ✓ Ad integration docs
├── TESTING_GUIDE.md                    ✓ Full testing guide
├── QUICK_START_TESTING.md              ✓ Quick test steps
└── validate.ps1 / validate.sh          ✓ Validation script
```

---

## 🚀 Step 6: Initial Test Run

### Test Scenario: Complete Flow

1. **Clear browser cache:**
   ```
   DevTools → Settings → Clear cache
   ```

2. **Start dev server:**
   ```bash
   npm run dev
   ```

3. **Visit homepage:**
   - http://localhost:3000
   - Should load with hero section visible

4. **Test login:**
   - Click "Get Started" or go to /login
   - Click "Sign in with Google"
   - Complete auth
   - Should land on dashboard

5. **Test calculator:**
   - Fill in Unit Economics (any numbers)
   - Click "Apply Unit Economics Changes"
   - Should see values update

6. **Test insights:**
   - Click "Generate AI Insights"
   - Should return insights in 10-30 seconds

7. **Test persistence:**
   - Refresh page (Ctrl+R)
   - Data should still be there

### Expected Timeline
- Login: 5-10 seconds
- Dashboard load: 2-3 seconds
- Apply changes: < 1 second
- Generate insights: 10-30 seconds

---

## 🔍 Step 7: Debugging Tips

### Issue: Build fails
```bash
# Solution 1: Clear cache
rm -rf .next node_modules
npm install
npm run build

# Solution 2: Check Node version
node --version  # Should be v18+

# Solution 3: Check for TypeScript errors
npx tsc --noEmit
```

### Issue: Dev server won't start
```bash
# Check if port 3000 is in use
# Kill process on port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Try different port
npm run dev -- -p 3001
```

### Issue: Auth not working
```bash
# Verify Supabase credentials
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY

# Check browser console for errors (F12)
# Check Network tab for failed requests
```

### Issue: Insights timeout
```bash
# Check API key validity
# Check network latency (DevTools Network tab)
# Verify GEMINI_MODEL is correct
# Increase GEMINI_TIMEOUT_MS if needed
```

### Issue: Ad integrations not working
```bash
# Verify redirect URIs match exactly
# Check OAuth credentials format
# Look for browser console errors
# Check DevTools Network tab for OAuth responses
```

---

## 📱 Step 8: Browser DevTools Verification

Open DevTools (F12) and check:

### Console Tab
- [ ] No red error messages on startup
- [ ] No 404 errors for API calls
- [ ] No CORS errors
- [ ] No authentication errors

### Network Tab
- [ ] All API calls return 200/201 status
- [ ] No failed requests
- [ ] Page load time < 3 seconds
- [ ] Insights API takes 10-30 seconds

### Application Tab
- [ ] Supabase auth token stored
- [ ] Session storage shows report data
- [ ] Local storage shows preferences

### Performance Tab
- [ ] FCP (First Contentful Paint) < 1.5s
- [ ] LCP (Largest Contentful Paint) < 2.5s

---

## 📊 Step 9: Database Verification

In Supabase Dashboard:

### Tables Check
1. Go to SQL Editor
2. Run each query:

```sql
-- Check user_profiles
SELECT COUNT(*) as profile_count FROM user_profiles;

-- Check user_workspaces
SELECT COUNT(*) as workspace_count FROM user_workspaces;

-- Check ad_accounts
SELECT COUNT(*) as ad_account_count FROM ad_accounts;

-- Check ad_metrics
SELECT COUNT(*) as ad_metrics_count FROM ad_metrics;
```

### RLS Policies Check
1. Go to Authentication → Policies
2. Verify policies exist for:
   - [ ] user_profiles
   - [ ] user_workspaces
   - [ ] brand_vault_entries
   - [ ] ad_accounts
   - [ ] ad_metrics

---

## ✅ Step 10: Final Checklist Before Launch

- [ ] `.env.local` file has all required variables
- [ ] `npm run build` succeeds without errors
- [ ] `npx tsc --noEmit` passes all type checks
- [ ] Dev server starts: `npm run dev`
- [ ] Homepage loads at http://localhost:3000
- [ ] Login flow works end-to-end
- [ ] Dashboard loads after login
- [ ] Calculator sections calculate correctly
- [ ] Data persists on page refresh
- [ ] Insights generate in < 30 seconds
- [ ] Validation script passes all checks
- [ ] No errors in browser console (F12)
- [ ] Database tables verified
- [ ] RLS policies active
- [ ] Ad accounts can connect (if enabled)

---

## 🎯 Next Steps After Validation

1. **Local Testing Complete** ✓
2. **Ready for Staging Deploy** → Push to `dev` branch
3. **Ready for Production Deploy** → Merge to `main` and deploy to Vercel

---

## 📞 Support

| Issue | Resource |
|-------|----------|
| Supabase problems | https://supabase.com/docs |
| Next.js issues | https://nextjs.org/docs |
| TypeScript errors | https://www.typescriptlang.org/docs |
| Gemini API help | https://ai.google.dev/docs |
| Meta Ads API | https://developers.facebook.com/docs |
| Google Ads API | https://developers.google.com/google-ads/api |

