# 📋 Complete Testing Workflow Overview

## 🎯 What You Need to Test

Your D2C app has these main components that need validation:

```
┌─────────────────────────────────────────┐
│         D2C Application Stack           │
├─────────────────────────────────────────┤
│                                         │
│  🎨 Frontend (React/Next.js)            │
│  ├─ Pages (Home, Login, Dashboard)     │
│  ├─ UI Components                      │
│  └─ Forms & Calculations               │
│                                         │
│  🔌 Backend (Next.js API Routes)        │
│  ├─ Authentication                     │
│  ├─ Insights (Gemini LLM)              │
│  ├─ Brand Vault                        │
│  └─ Ad Integrations (Meta, Google)     │
│                                         │
│  💾 Database (Supabase/PostgreSQL)      │
│  ├─ User Profiles                      │
│  ├─ Workspaces                         │
│  ├─ Ad Accounts                        │
│  └─ Ad Metrics                         │
│                                         │
│  🤖 External APIs                       │
│  ├─ Google Gemini (AI)                 │
│  ├─ Meta Ads API                       │
│  ├─ Google Ads API                     │
│  └─ Supabase Auth                      │
│                                         │
└─────────────────────────────────────────┘
```

---

## 📚 Documentation Files Created

| File | Purpose | Time |
|------|---------|------|
| **QUICK_START_TESTING.md** | Step-by-step test workflow with exact steps | 2-3 hours |
| **TESTING_GUIDE.md** | Comprehensive 11-phase testing checklist | Complete |
| **ENVIRONMENT_CHECKLIST.md** | Environment setup & configuration guide | 30 min |
| **validate.ps1** | Windows automated validation | 2 min |
| **validate.sh** | Mac/Linux automated validation | 2 min |

---

## 🚀 Quick Start (Choose One)

### Option A: Fast Path (Minimal Testing)
Estimated time: **30 minutes**

```
1. Run validation script (2 min)
   └─ Windows: .\validate.ps1
   └─ Mac/Linux: bash validate.sh

2. Start dev server (2 min)
   └─ npm run dev

3. Test core flow (25 min)
   ├─ Homepage loads
   ├─ Google login works
   ├─ Dashboard shows
   ├─ Calculator works
   └─ Data persists on refresh
```

**✅ If all above work: Application is functional**

---

### Option B: Standard Path (Recommended)
Estimated time: **2-3 hours**

Follow **QUICK_START_TESTING.md** Phase A through Phase E:
- Basic functionality
- Calculator sections
- AI insights
- Data persistence
- Brand vault

**✅ If all above work: Ready for production**

---

### Option C: Complete Path (Thorough)
Estimated time: **4-5 hours**

Follow **TESTING_GUIDE.md** all 11 phases including:
- All of Option B
- Full API testing
- Performance baselines
- Error handling
- Production checklist

**✅ If all above work: Enterprise-ready**

---

## 📊 Testing Matrix

### Coverage by Component

| Component | Quick | Standard | Complete |
|-----------|-------|----------|----------|
| Homepage | ✅ | ✅ | ✅ |
| Auth Flow | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ |
| Calculator | ✓ | ✅ | ✅ |
| Insights | ✓ | ✅ | ✅ |
| Data Persist | ✓ | ✅ | ✅ |
| Brand Vault | | ✅ | ✅ |
| Ad Integrations | | ✓ | ✅ |
| API Routes | | | ✅ |
| Performance | | | ✅ |
| Error Handling | | | ✅ |

Legend: ✅ = Full test, ✓ = Basic test, blank = Not tested

---

## 🔍 Critical Path Testing

These tests MUST pass or app is broken:

1. **Build succeeds**
   ```bash
   npm run build
   # Expected: ✓ Build successful
   ```

2. **Dev server starts**
   ```bash
   npm run dev
   # Expected: ✓ Ready in X.Xs
   ```

3. **Homepage loads**
   - Visit: http://localhost:3000
   - Expected: Page with hero section, no errors

4. **Google auth works**
   - Click: "Sign in with Google"
   - Expected: Redirect to dashboard after auth

5. **Dashboard accessible**
   - After login should see: Dashboard with sections
   - Expected: "All Saved" badge visible

6. **Calculator works**
   - Enter data in Unit Economics
   - Click: "Apply Unit Economics Changes"
   - Expected: Values calculate and display

7. **Data persists**
   - Refresh page (Ctrl+R)
   - Expected: Data still there

**If ANY of above fails = BLOCKING BUG**

---

## 🛠️ Tools You'll Need

### Browser Tools (Built-in)
- Chrome/Firefox DevTools (F12)
  - Console tab: Check for errors
  - Network tab: Check API calls
  - Lighthouse: Performance audit

### Command Line
```bash
npm              # Already installed
node --version   # Check version (18+)
git              # Version control
```

### Optional Tools
```bash
curl             # Test APIs manually
Thunder Client   # API testing (VS Code extension)
Postman          # API testing (desktop app)
```

---

## 📋 Test Checklist Template

Print this and check off as you test:

```
QUICK VALIDATION
├─ [ ] npm run build - no errors
├─ [ ] npm run dev - starts successfully
├─ [ ] http://localhost:3000 loads
├─ [ ] Google login works
└─ [ ] Dashboard shows user email

CALCULATOR TESTING
├─ [ ] Unit Economics calculates
├─ [ ] Ad Metrics calculates
├─ [ ] Scale Planner allocates
├─ [ ] P&L auto-derives
└─ [ ] All show status badges

INSIGHTS TESTING
├─ [ ] Insights generate within 30s
├─ [ ] Summary paragraph appears
├─ [ ] All 8 sections populate
├─ [ ] No JSON errors in console
└─ [ ] References actual numbers

DATA PERSISTENCE
├─ [ ] Data saves after Apply
├─ [ ] Persists on page refresh
├─ [ ] Scenarios save and load
├─ [ ] Multiple scenarios work
└─ [ ] Can switch between scenarios

BRAND VAULT
├─ [ ] Page loads at /brand-vault
├─ [ ] Form accepts input
├─ [ ] Save works
├─ [ ] Badge shows "Complete"
└─ [ ] Insights reference brand

AD INTEGRATIONS (Optional)
├─ [ ] Database tables created
├─ [ ] Meta Ads connects
├─ [ ] Google Ads connects
├─ [ ] Metrics display in dashboard
└─ [ ] Can disconnect and reconnect

API TESTING
├─ [ ] Health check works
├─ [ ] Brand vault API works
├─ [ ] Insights API works
├─ [ ] Integration endpoints work
└─ [ ] All return correct data

PERFORMANCE
├─ [ ] Page loads < 3s
├─ [ ] Dashboard < 4s
├─ [ ] Insights < 30s
└─ [ ] No loading spinners stalling

ERROR HANDLING
├─ [ ] Network errors show toast
├─ [ ] Invalid input rejected
├─ [ ] Session expiry redirects
└─ [ ] API errors handled gracefully

FINAL CHECK
├─ [ ] No red errors in console
├─ [ ] No 404 errors in Network tab
├─ [ ] No CORS errors
└─ [ ] Ready for deployment

SIGN OFF
Date: _______________
Tester: _______________
Status: [ ] PASS [ ] FAIL
Notes: _______________
```

---

## 🎬 Test Execution Flow

```
START
  │
  ├─→ Run validate script (2 min)
  │   └─ All checks pass? → Continue : STOP (fix issues)
  │
  ├─→ Start dev server (2 min)
  │   └─ Ready message? → Continue : STOP (check console)
  │
  ├─→ Test homepage (3 min)
  │   └─ Loads with styling? → Continue : STOP (check build)
  │
  ├─→ Test auth (5 min)
  │   └─ Dashboard after login? → Continue : STOP (check Supabase)
  │
  ├─→ Test calculator (20 min)
  │   └─ All sections calculate? → Continue : STOP (check formulas)
  │
  ├─→ Test insights (10 min)
  │   └─ Generate in < 30s? → Continue : STOP (check API key)
  │
  ├─→ Test persistence (5 min)
  │   └─ Data survives refresh? → Continue : STOP (check RLS)
  │
  └─→ COMPLETE
      ├─ [ ] PASS - Ready for prod
      └─ [ ] FAIL - See notes for issues
```

---

## 📞 Getting Unstuck

### If build fails:
```bash
rm -rf .next
npm install
npm run build
```

### If dev server won't start:
```bash
# Kill any process on port 3000
# Mac/Linux:
lsof -ti:3000 | xargs kill -9

# Windows PowerShell:
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# Then try again:
npm run dev
```

### If auth doesn't work:
1. Check .env has NEXT_PUBLIC_SUPABASE_URL
2. Check .env has NEXT_PUBLIC_SUPABASE_ANON_KEY
3. Check Supabase dashboard auth is enabled
4. Clear browser cookies and cache

### If insights timeout:
1. Verify GEMINI_API_KEY is correct
2. Check internet connection
3. Increase GEMINI_TIMEOUT_MS to 30000
4. Check browser DevTools Network tab for timeout

### If data doesn't persist:
1. Verify SUPABASE_SERVICE_ROLE_KEY is correct
2. Check Supabase RLS policies are enabled
3. Verify user_id in database matches
4. Check browser DevTools Network tab for 403 errors

---

## ✅ Sign-Off Criteria

You're ready to deploy when:

- [ ] All critical path tests pass
- [ ] Build completes without errors
- [ ] No red errors in browser console
- [ ] All calculator sections work
- [ ] Insights generate within 30s
- [ ] Data persists on refresh
- [ ] Auth flow works end-to-end
- [ ] Dashboard loads for authenticated users
- [ ] No 404 or CORS errors
- [ ] Performance meets expectations

---

## 📞 Support Resources

| Issue | Resource |
|-------|----------|
| Build/Deploy | Next.js Docs: https://nextjs.org/docs |
| Database | Supabase Docs: https://supabase.com/docs |
| Auth | Supabase Auth: https://supabase.com/docs/guides/auth |
| API | Gemini: https://ai.google.dev/docs |
| Ads | Meta: https://developers.facebook.com/docs |
| Ads | Google: https://developers.google.com/google-ads/api |

---

## 🎯 Next Steps

1. ✅ **Read This Document** (you are here)
2. 📖 **Choose Test Path** (Quick/Standard/Complete)
3. 🚀 **Run Validation** (.\validate.ps1 or bash validate.sh)
4. 🧪 **Follow Test Docs** (QUICK_START_TESTING.md)
5. ✓ **Check Off Items** (Use checklist template)
6. 📊 **Document Results** (Note any failures)
7. 🚢 **Deploy** (When all pass)

---

**Last Updated:** May 5, 2026
**Version:** 1.0
**Status:** Ready for Testing

