# ✅ YOUR TESTING CHECKLIST & PROGRESS TRACKER

## 📋 Complete Testing Checklist

Print this page and check off items as you complete them!

---

## PHASE 1: ENVIRONMENT & SETUP (⏱️ 20 minutes)

### Pre-Flight Checks
```
Environment Setup
[ ] Windows or Mac/Linux identified
[ ] Node.js installed (version 18+)
[ ] npm installed (version 9+)
[ ] Git installed
[ ] VSCode open with project folder
[ ] Internet connection active

Configuration
[ ] .env.local file created
[ ] SUPABASE_URL added
[ ] SUPABASE_ANON_KEY added
[ ] SUPABASE_SERVICE_ROLE_KEY added
[ ] GEMINI_API_KEY added
[ ] GEMINI_MODEL = models/gemini-2.5-flash
[ ] NEXT_PUBLIC_ADMIN_EMAIL added
[ ] All required vars verified
```

### Initial Validation
```
Validation Script
[ ] Ran: .\validate.ps1 (Windows) OR bash validate.sh (Mac/Linux)
[ ] Output: ✅ Node.js check passed
[ ] Output: ✅ npm check passed
[ ] Output: ✅ File structure check passed
[ ] Output: ✅ Environment variables check passed
[ ] Output: ✅ Dependencies installed
[ ] Output: ✅ Build test passed
[ ] Output: ✅ TypeScript check passed

All Green? ✅ Continue to Phase 2
Any Red? ❌ Fix issue, re-run validation
```

---

## PHASE 2: BUILD & SERVER (⏱️ 5 minutes)

```
Build Test
[ ] Ran: npm run build
[ ] Status: ✅ Build successful
[ ] Status: ✅ No errors (0 failed)
[ ] Status: ✅ No warnings (or acceptable warnings)
[ ] Time: Build took _____ seconds

Development Server
[ ] Ran: npm run dev
[ ] Status: ✅ Ready in X.Xs
[ ] Status: ✅ Local: http://localhost:3000
[ ] Status: ✅ No error messages in terminal

Ready to Test? ✅ Move to Phase 3
```

---

## PHASE 3: BASIC FUNCTIONALITY (⏱️ 30 minutes)

### Homepage
```
[ ] Opened: http://localhost:3000
[ ] Visual: Page loaded with styling
[ ] Visual: Hero section visible
[ ] Visual: Features section visible
[ ] Visual: Pricing section visible
[ ] Button: "Get Started" button clickable
[ ] Button: "Sign In" button visible
[ ] Performance: Page loaded in _____ seconds
[ ] Console: F12 → Console tab open
[ ] Console: No red errors visible
[ ] Console: No 404 errors visible

Homepage Status: [ ] PASS [ ] FAIL
If FAIL, issue: _______________
```

### Google Login
```
[ ] Clicked: "Sign In with Google" button
[ ] Page: Google popup appeared
[ ] Action: Selected test Google account
[ ] Page: Redirected to Dashboard
[ ] Display: Email shown (top right corner)
[ ] Display: "All Saved" badge visible
[ ] Console: No errors after login

Login Status: [ ] PASS [ ] FAIL
If FAIL, issue: _______________
```

### Dashboard Initial Load
```
[ ] Page: Dashboard loaded completely
[ ] Sections: Unit Economics section visible
[ ] Sections: Ad Metrics section visible
[ ] Sections: Ad Performance section visible
[ ] Sections: Scale Planner section visible
[ ] Sections: Monthly P&L section visible
[ ] Status: All sections showing status badges
[ ] Display: No broken images
[ ] Display: Styling looks correct

Dashboard Status: [ ] PASS [ ] FAIL
If FAIL, issue: _______________
```

---

## PHASE 4: CALCULATOR TESTING (⏱️ 45 minutes)

### Unit Economics Section
```
Test Setup
[ ] Clicked: Unit Economics section
[ ] Form Visible: Product fields appear
[ ] Form Visible: Cost fields appear
[ ] Form Visible: Button "Apply Unit Economics Changes" visible

Test Data Entry
[ ] Entered: Selling Price (MRP) = 500
[ ] Entered: COGS = 150
[ ] Entered: Platform Fee % = 15
[ ] Entered: Logistics Cost = 50
[ ] Entered: Return Rate % = 5
[ ] Verified: All fields show entered values

Test Calculation
[ ] Clicked: "Apply Unit Economics Changes"
[ ] Wait: Animation completed
[ ] Display: Net Revenue calculated
[ ] Display: COGS % calculated
[ ] Display: Gross Margin calculated
[ ] Display: Total Margin calculated
[ ] Verify: Math is correct (check manually)
[ ] Badge: "Unit Economics: Complete" shows

Unit Economics: [ ] PASS [ ] FAIL
```

### Ad Metrics Section
```
[ ] Clicked: Ad Metrics section
[ ] Entered: Monthly Ad Spend = 10000
[ ] Entered: Avg CPC = 25
[ ] Entered: Avg CTR = 0.02
[ ] Entered: Avg Conversion Rate = 0.03
[ ] Clicked: "Apply Ad Metrics Changes"
[ ] Verify: All calculations appear
[ ] Verify: Numbers make sense
[ ] Badge: "Ad Metrics: Complete" shows

Ad Metrics: [ ] PASS [ ] FAIL
```

### Scale Planner Section
```
[ ] Clicked: Scale Planner section
[ ] Entered: Target Revenue = 50000
[ ] Display: Auto-calculated allocations appear
[ ] Verify: Numbers are sensible
[ ] Badge: "Scale Planner: Complete" shows

Scale Planner: [ ] PASS [ ] FAIL
```

### Monthly P&L
```
[ ] Scrolled: To see Monthly P&L section
[ ] Display: Auto-populated with calculated values
[ ] Verify: Revenue = Ad Spend * Conversion data
[ ] Verify: Shows net P&L calculation
[ ] Badge: "Monthly P&L" shows status

Monthly P&L: [ ] PASS [ ] FAIL
```

---

## PHASE 5: AI INSIGHTS (⏱️ 15 minutes)

```
Generate Insights
[ ] Clicked: "Generate AI Insights" button
[ ] Status: Loading spinner appeared
[ ] Wait: Insights generating (takes 10-30 seconds)
[ ] Time: Generation took _____ seconds (target: < 30s)

Verify Insights
[ ] Display: Summary paragraph appears
[ ] Display: Priority Fixes section populated
[ ] Display: Growth Levers section populated
[ ] Display: Key Alerts section populated
[ ] Display: Health Score shown
[ ] Display: Bottlenecks identified
[ ] Display: Strengths identified
[ ] Display: All 8 sections visible

Insights Content
[ ] Verify: Text is coherent
[ ] Verify: References actual numbers
[ ] Verify: Recommendations are relevant
[ ] Verify: No JSON errors showing
[ ] Console: No red errors

Insights Generation: [ ] PASS [ ] FAIL
If timeout: Check GEMINI_API_KEY in .env
```

---

## PHASE 6: DATA PERSISTENCE (⏱️ 10 minutes)

```
Test 1: Page Refresh
[ ] Note: Current data in Unit Economics section
[ ] Action: Pressed Ctrl+R (refresh page)
[ ] Wait: Page reloaded (takes 2-3 seconds)
[ ] Verify: All data still present
[ ] Verify: Values unchanged
[ ] Status: ✅ Data persisted

Test 2: Browser Back/Forward
[ ] Action: Clicked browser back button
[ ] Action: Clicked browser forward button
[ ] Verify: Landed back on dashboard
[ ] Verify: All data still present

Test 3: Scenario Management
[ ] Clicked: "Save Scenario" or similar
[ ] Entered: Scenario name: "Test Scenario 1"
[ ] Created: Second scenario
[ ] Switched: Between scenarios
[ ] Verified: Each has correct data
[ ] Deleted: One scenario
[ ] Verified: Other scenario still exists

Persistence: [ ] PASS [ ] FAIL
If data lost: Check Supabase RLS policies
```

---

## PHASE 7: BRAND VAULT (⏱️ 10 minutes)

```
Navigation
[ ] Clicked: Brand Vault link (in nav or /brand-vault)
[ ] Display: Brand Vault page loaded
[ ] Form: Visible with input fields

Data Entry
[ ] Entered: Brand Name: "My Test Brand"
[ ] Entered: Brand Description: "Test description"
[ ] Entered: Other brand details as applicable
[ ] Clicked: "Save Brand" button

Verification
[ ] Display: Success message shown
[ ] Badge: Dashboard shows "Brand Vault: Complete"
[ ] Persistence: Refresh page
[ ] Verify: Brand data still there

Insights Integration
[ ] Generate: New insights
[ ] Verify: Insights reference brand name
[ ] Verify: Insights use brand context

Brand Vault: [ ] PASS [ ] FAIL
```

---

## PHASE 8: AD INTEGRATIONS (⏱️ 30 minutes)

### Database Setup
```
[ ] Check: Supabase dashboard open
[ ] Verify: ad_accounts table exists
[ ] Verify: ad_metrics table exists
[ ] Verify: RLS policies applied
[ ] Verify: Can see tables via SQL

Database: [ ] PASS [ ] FAIL
```

### Meta Ads (if using)
```
[ ] Clicked: "Connect Meta Ads" button
[ ] Redirected: To Facebook login
[ ] Logged In: With test Meta app
[ ] Approved: App permissions
[ ] Returned: To dashboard
[ ] Display: Account ID shown
[ ] Status: "Connected" displayed
[ ] Able to: Disconnect and reconnect

Meta Ads: [ ] PASS [ ] FAIL
If fails: Check callback URL in .env and Meta settings
```

### Google Ads (if using)
```
[ ] Clicked: "Connect Google Ads" button
[ ] Redirected: To Google login
[ ] Logged In: With Google account
[ ] Approved: Scope permissions
[ ] Returned: To dashboard
[ ] Display: Account ID shown
[ ] Status: "Connected" displayed
[ ] Able to: Disconnect and reconnect

Google Ads: [ ] PASS [ ] FAIL
If fails: Check redirect URI matches Google settings
```

### Ad Metrics Display
```
[ ] Display: Ad Performance section shows accounts
[ ] Display: Metrics table populated (if data available)
[ ] Display: Spend, ROAS, clicks showing
[ ] Generate: New insights
[ ] Verify: Insights include ad platform data

Ad Metrics: [ ] PASS [ ] FAIL
```

---

## PHASE 9: PERFORMANCE (⏱️ 15 minutes)

### Page Load Performance
```
[ ] Opened: Chrome DevTools (F12)
[ ] Tab: Performance or Network
[ ] Metric: Homepage load time: _____ seconds (target: < 3s)
[ ] Metric: Dashboard load time: _____ seconds (target: < 4s)
[ ] Metric: Full page interactive: _____ seconds

Performance Metrics
[ ] CLS (Cumulative Layout Shift): < 0.1 (good)
[ ] LCP (Largest Contentful Paint): < 2.5s (good)
[ ] FID (First Input Delay): < 100ms (good)

Build Performance
[ ] Build time: _____ seconds (target: < 60s)
[ ] Build size: Check .next folder size
[ ] Optimized: Images/fonts loaded

Performance: [ ] PASS [ ] FAIL
```

---

## PHASE 10: ERROR HANDLING (⏱️ 15 minutes)

### Console Error Check
```
Current State
[ ] Opened: F12 Console
[ ] Scanned: For red error messages
[ ] Count: _____ errors visible
[ ] Status: [ ] No errors (PASS) [ ] Has errors (FAIL)
[ ] If errors: List them: _______________
```

### Network Error Simulation
```
[ ] Opened: DevTools Network tab
[ ] Throttle: Set to "Offline"
[ ] Action: Tried to generate insights
[ ] Result: Error handled gracefully
[ ] Status: Toggled back online
[ ] Recovery: Function worked after

Error Handling: [ ] PASS [ ] FAIL
```

### Session/Auth Tests
```
[ ] Signed Out: Logged out of app
[ ] Verify: Redirected to login page
[ ] Signed In: Logged back in
[ ] Verify: All data intact
[ ] Verify: Session works correctly

Auth Recovery: [ ] PASS [ ] FAIL
```

---

## FINAL VERIFICATION (⏱️ 5 minutes)

### Sign-Off Checklist

```
✅ CRITICAL TESTS
[ ] npm run build succeeded
[ ] npm run dev started
[ ] Homepage loads
[ ] Google login works
[ ] Dashboard accessible
[ ] Calculator computes
[ ] Data persists
[ ] Insights generate
[ ] No console errors

✅ FEATURE TESTS
[ ] Unit Economics works
[ ] Ad Metrics works
[ ] Scale Planner works
[ ] Monthly P&L works
[ ] All show status badges

✅ ADVANCED TESTS
[ ] Insights complete
[ ] Brand Vault works
[ ] Ad integrations connect
[ ] Metrics display correctly

✅ FINAL QUALITY GATES
[ ] No red errors in console
[ ] No 404 errors
[ ] No CORS errors
[ ] Performance acceptable
[ ] All features accessible
[ ] Data persists correctly
[ ] Auth flow works
```

---

## FINAL SIGN-OFF

```
Testing Completion Status
═════════════════════════════════════════

Overall Status:        [ ] PASS ✅  [ ] FAIL ❌

Date Tested:           _____________

Tester Name:           _____________

Total Tests Passed:    _____ / _____

Critical Issues Found: [ ] None   [ ] Yes (list below)

Notes:
_________________________________________________
_________________________________________________
_________________________________________________

Ready for Production?  [ ] YES ✅   [ ] NO ❌

Next Steps:
[ ] Fix issues (if any)
[ ] Run validate script again
[ ] Deploy to Vercel
[ ] Setup monitoring
[ ] Notify team
```

---

## 📊 Progress Tracker

Fill in as you complete each phase:

```
Phase 1: Environment Setup      [ ]        Minutes: ___
Phase 2: Build & Server         [ ]        Minutes: ___
Phase 3: Basic Functionality    [ ]        Minutes: ___
Phase 4: Calculator             [ ]        Minutes: ___
Phase 5: Insights               [ ]        Minutes: ___
Phase 6: Data Persistence       [ ]        Minutes: ___
Phase 7: Brand Vault            [ ]        Minutes: ___
Phase 8: Ad Integrations        [ ]        Minutes: ___
Phase 9: Performance            [ ]        Minutes: ___
Phase 10: Error Handling        [ ]        Minutes: ___

TOTAL TIME SPENT: _____ minutes
EXPECTED TIME: 2-3 hours
STATUS: [ ] On track  [ ] Behind  [ ] Ahead
```

---

## 🎯 Summary

**All phases completed?** ✅
**All tests passed?** ✅
**No critical issues?** ✅
**Ready for deployment?** ✅

**→ READY FOR PRODUCTION** 🚀

---

**Print this checklist and keep it with you while testing!**

