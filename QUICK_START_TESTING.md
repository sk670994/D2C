# Quick Start: Testing & Validation Workflow

## 🚀 START HERE - 5 Minute Quick Check

### Step 1: Validate Setup
Run the validation script for your OS:

**Windows (PowerShell):**
```powershell
.\validate.ps1
```

**Mac/Linux:**
```bash
bash validate.sh
```

Expected output:
- ✓ All project files exist
- ✓ All environment variables set
- ✓ Build successful
- ✓ TypeScript passes

### Step 2: Start Dev Server
```bash
npm run dev
```

Look for:
```
✓ Ready in 2.5s
```

### Step 3: Open in Browser
Visit: http://localhost:3000

Expected:
- Page loads with styling
- No red error messages
- "Sign In" button visible

---

## ✅ Phase A: Basic Functionality (30 minutes)

### A1: Homepage
```
Route: http://localhost:3000
```

**Checklist:**
- [ ] Page loads completely
- [ ] Hero section visible
- [ ] Features grid shows 4+ cards
- [ ] Pricing section visible
- [ ] "Get Started" button works
- [ ] No console errors (F12)

**Test Step:**
1. Open F12 DevTools → Console tab
2. Verify no red errors
3. Refresh page → Still no errors

---

### A2: Login & Authentication
```
Route: http://localhost:3000/login
```

**Checklist:**
- [ ] Login page loads
- [ ] "Sign in with Google" button visible
- [ ] Email/password fields visible (if enabled)
- [ ] "Forgot password" link present

**Test Google Login:**
1. Click "Sign in with Google"
2. Complete Google auth flow
3. Should redirect to dashboard automatically
4. Email should display in top right

**What to look for:**
- ❌ If redirects to blank page: Check Supabase config
- ❌ If shows error: Verify Google Client ID/Secret in .env

---

### A3: Dashboard Access
```
Route: http://localhost:3000/dashboard
```

**Checklist:**
- [ ] Page loads without errors
- [ ] Left sidebar visible with section options
- [ ] Hero section shows metrics (all showing 0 is OK initially)
- [ ] "All Saved" badge visible
- [ ] User email shows in top right

**Test Navigation:**
1. Click "Unit Economics" in sidebar
2. Should scroll to that section
3. Click "All Sections"
4. All 5 sections visible

---

## ✅ Phase B: Calculator Testing (45 minutes)

### B1: Unit Economics
```
Section: Left sidebar → Unit Economics
```

**Step-by-step test:**

1. **Enter basic data:**
   - Selling Price (MRP): `500`
   - Discount: `50`
   - GST Rate: `0.18`
   - Raw Material: `100`
   - Packaging: `20`
   - Shipping: `30`

2. **Click "Apply Unit Economics Changes"**

3. **Verify outputs appear:**
   - ✓ Net Revenue / Order shows INR value
   - ✓ Total COGS shows calculation
   - ✓ Gross Margin shows positive number
   - ✓ Contribution Margin shows calculation

4. **Check status:**
   - If Contribution Margin % ≥ 30% → Shows GREEN "Healthy" badge
   - If Contribution Margin % < 30% → Shows YELLOW "Warning" badge

**Expected Results (with above data):**
- Net Revenue ≈ 500-50 = 420 (after discount)
- Total COGS ≈ 100+20 = 120
- Gross Margin ≈ 300+
- Contribution Margin % should show percentage

---

### B2: Ad Metrics
```
Section: Left sidebar → Ad Metrics
```

**Step-by-step test:**

1. **Enter ad data:**
   - Total Ad Spend: `10000`
   - Impressions: `100000`
   - Clicks: `5000`
   - Orders: `500`
   - Revenue: `250000`

2. **Click "Apply Ad Metrics Changes"**

3. **Verify calculations:**
   - Blended ROAS: Should show ≈ 25x (250k revenue / 10k spend)
   - Blended CAC: Should calculate from spend/orders
   - CTR: Should calculate impressions/clicks ratio
   - CVR: Should calculate clicks/orders ratio

4. **Check badge:**
   - If ROAS ≥ 3x → GREEN "Healthy"
   - If ROAS < 3x → YELLOW "Warning"

---

### B3: Scale Planner
```
Section: Left sidebar → Scale Planner
```

**Step-by-step test:**

1. **Set growth targets:**
   - Revenue Growth: `1.5` (50% growth)
   - Ad Spend Growth: `1.3` (30% growth)
   - Orders Growth: `1.4` (40% growth)
   - CAC Improvement: `0.9` (10% reduction)

2. **Set allocations (must sum to 100%):**
   - Meta Allocation: `50%`
   - Google Allocation: `30%`
   - Other Allocation: `20%`
   - Total should show: 100% ✓

3. **Click "Apply Scale Planner Changes"**

4. **Verify outputs:**
   - Target Revenue shows increased amount
   - Platform budgets calculated (Meta, Google, Other)
   - Scale Verdict shows "READY TO SCALE" (GREEN) or "HOLD" (YELLOW)

---

### B4: Monthly P&L
```
Section: Left sidebar → Monthly P&L
```

**Verification:**
- [ ] Section shows as "auto-derived"
- [ ] All values calculate based on previous sections
- [ ] Net Profit shows positive or negative
- [ ] Profit Margin % displays
- [ ] Clicking Apply does nothing (read-only)

**Test:**
Change any section input → Apply → P&L values update automatically

---

## ✅ Phase C: AI Insights Testing (15 minutes)

### C1: Generate Insights
```
Section: Dashboard → Execution Controls
```

**Test Steps:**

1. **Ensure data is filled in** (from Phase B)

2. **Click "Generate AI Insights"**
   - Button should change to "Generating..."
   - Should take 5-25 seconds

3. **Verify insights appear:**
   - [ ] Summary paragraph (2-3 sentences)
   - [ ] Priority Fixes list (4-6 items)
   - [ ] Growth Levers list
   - [ ] Risk Alerts list
   - [ ] Channel Plan
   - [ ] Experiment Backlog
   - [ ] Cashflow Actions
   - [ ] Watch List KPIs
   - [ ] Next 30 Days plan

**Expected Summary example:**
*"You're running healthy unit economics (38% contribution margin) with strong paid media efficiency (18.5x ROAS). Primary opportunity: scale spend on Meta (50% allocation) while testing new audience segments on Google. Watch CAC closely as you grow."*

**Troubleshooting:**
- ❌ "Error generating insights": Check GEMINI_API_KEY in .env
- ❌ "Loading forever": Check network tab in DevTools → Check API response
- ❌ "Insights missing fields": Check console for JSON parse errors

---

## ✅ Phase D: Data Persistence (10 minutes)

### D1: Auto-Save Test
```
Dashboard
```

**Test Steps:**

1. **Enter data in Unit Economics**
2. **Click "Apply Unit Economics Changes"**
3. **Look for "Syncing cloud data..." badge** (briefly appears)
4. **Wait for "Cloud sync ready" message**
5. **Refresh page** (Ctrl+R or Cmd+R)
6. **Data should still be there** ✓

**If data is lost:**
- ❌ Check Supabase `user_workspaces` table has your data
- ❌ Check RLS policies aren't blocking reads
- ❌ Check `SUPABASE_SERVICE_ROLE_KEY` is correct

---

### D2: Scenario Save Test

1. **Fill in complete data** (Unit → Ad → Scale)
2. **Click "Save Scenario"**
3. **Enter scenario name** (e.g., "Conservative Growth")
4. **Confirm save**
5. **Change some data**
6. **Click "Save Scenario"** again with different name
7. **In Scenario Lab at bottom**, verify 2 scenarios appear
8. **Click scenario name** to switch

Expected:
- Can save up to 3 scenarios
- Each scenario stores complete data snapshot
- Clicking scenario loads all data back

---

## ✅ Phase E: Brand Vault (10 minutes)

### E1: Brand Vault Setup
```
Route: http://localhost:3000/brand-vault
```

**Test Steps:**

1. **Fill in brand data:**
   - Brand Name: "Your Brand"
   - Website URL: "https://yourbrand.com"
   - Tone: "Professional, friendly, data-driven"
   - Audience: "E-commerce founders, growth marketers"
   - Hero Product: "D2C Analytics Platform"
   - Main Objection: "Complex setup, takes time"
   - Do Not Say: "Enterprise software"
   - Competitor Focus: "Shopify, Google Analytics"

2. **Click "Save Brand Vault"**

3. **Verify success message appears**

4. **Go to dashboard**

5. **Check "Brand Vault: Complete" badge shows** (was showing "Incomplete")

---

### E2: Verify Brand Context in Insights

1. **On dashboard, generate insights** again
2. **Read the summary**
3. **Should reference your brand context**

Example output might say:
*"As a D2C Analytics Platform targeting growth marketers, your focus should be..."*

Instead of generic advice.

---

## ✅ Phase F: Ad Integrations (30 minutes)

### F1: Database Preparation

1. **Go to Supabase dashboard**
2. **SQL Editor → New query**
3. **Paste content of `supabase-schema.sql`**
4. **Run query**
5. **Verify tables created:**
   - Check left sidebar → Tables → `ad_accounts` ✓
   - Check left sidebar → Tables → `ad_metrics` ✓

---

### F2: Meta Ads Connection

**Prerequisites:**
- [ ] META_APP_ID set in .env
- [ ] META_APP_SECRET set in .env
- [ ] .env file saved
- [ ] Dev server restarted after changing .env

**Test Steps:**

1. **On dashboard, scroll to "Ad Performance" section**
2. **Click "Connect Meta Ads"**
3. **Should redirect to Facebook login**
4. **Login with Facebook test account**
5. **Should show authorization screen** for app permissions
6. **Click "Allow"**
7. **Should redirect back to dashboard** with success
8. **"Connected" status should show** on Ad Performance section
9. **Account ID should display** (e.g., "act_123456789")

**Troubleshooting:**
- ❌ Blank page after Facebook: Check redirect URI in Meta app settings
- ❌ "App not installed": Check META_APP_ID is correct
- ❌ Auth error: Check META_APP_SECRET is correct

---

### F3: Google Ads Connection

**Prerequisites:**
- [ ] GOOGLE_CLIENT_ID set in .env
- [ ] GOOGLE_CLIENT_SECRET set in .env
- [ ] GOOGLE_ADS_DEVELOPER_TOKEN set in .env
- [ ] .env file saved
- [ ] Dev server restarted

**Test Steps:**

1. **Click "Connect Google Ads"**
2. **Should redirect to Google login**
3. **Complete Google auth flow**
4. **Grant app permissions**
5. **Should redirect back to dashboard**
6. **Google account should appear connected**

---

### F4: Ad Metrics Display

After connecting accounts:

1. **Wait a moment for data to load**
2. **"Recent Metrics" table should appear** with:
   - Campaign names
   - Spend amounts
   - ROAS values
   - Impressions

3. **Data should show recent performance**

**If no data:**
- ❌ Accounts connected but no campaigns: Create a test campaign in Meta/Google
- ❌ Accounts show but metrics empty: Manual metrics fetch needed

---

### F5: Manual Metrics Fetch (Optional)

```bash
# In terminal, with dev server running:

curl -X POST http://localhost:3000/api/integrations/meta-ads/fetch \
  -H "Content-Type: application/json" \
  -H "Cookie: your_session_cookie" \
  -d '{"accountId":"act_YOUR_ACCOUNT_ID"}'

# Expected response:
# {
#   "message": "Metrics fetched and stored successfully",
#   "campaignsCount": 5,
#   "metricsCount": 15
# }
```

---

## ✅ Phase G: API Testing (20 minutes)

### G1: Health Check
```bash
curl http://localhost:3000/api/health
```

**Expected Response:**
```json
{"status": "ok"}
```

---

### G2: Brand Vault API

```bash
curl http://localhost:3000/api/brand-vault \
  -H "Cookie: your_session_cookie"
```

**Expected Response (if set):**
```json
{
  "brandVault": {
    "brandName": "Your Brand",
    "tone": "Professional",
    ...
  }
}
```

**If empty:**
```json
{
  "brandVault": {}
}
```

---

### G3: Insights API

```bash
# Test with sample report
curl -X POST http://localhost:3000/api/insights \
  -H "Content-Type: application/json" \
  -H "Cookie: your_session_cookie" \
  -d '{
    "unitEconomics": {
      "netRevenueExGst": 300,
      "totalCogs": 100,
      "fulfillmentCost": 50,
      "contributionMargin": 150,
      "contributionMarginPct": 0.5,
      "maxAllowableCac": 100
    },
    "adMetrics": {
      "blendedRoas": 5,
      "blendedCac": 40,
      ...
    },
    ...
  }'
```

**Should return insights JSON**

---

## ✅ Phase H: Performance Baseline (15 minutes)

### H1: Lighthouse Audit

1. **Open Dev Tools (F12)**
2. **Go to Lighthouse tab**
3. **Click "Generate report"**

**Expected Scores:**
- Performance: > 50
- Accessibility: > 90
- Best Practices: > 80
- SEO: > 90

### H2: Page Load Times

**Using Chrome DevTools Network tab:**

1. **Open http://localhost:3000**
2. **Open DevTools → Network tab**
3. **Reload page**
4. **Check timing:**
   - Page load: < 3s ✓
   - Largest content: < 2.5s ✓

### H3: Dashboard Load
1. **Login and go to dashboard**
2. **Open Network tab**
3. **Time until "All Saved" badge appears**
4. **Should be < 4 seconds**

---

## ✅ Phase I: Error Handling (15 minutes)

### I1: Network Error Simulation

1. **Open DevTools**
2. **Go to Network tab**
3. **Click "Offline" dropdown**
4. **Select "Offline"**
5. **Try to perform action (e.g., save data)**
6. **Should show error toast**: "Network error"
7. **Go back "Online"**
8. **Retry → Should work**

### I2: Expired Session

1. **Wait 1 hour** (or manually clear auth token)
2. **Try to access dashboard**
3. **Should redirect to login**
4. **Login again → Dashboard loads**

### I3: Invalid Data

1. **In Unit Economics, try:**
   - Enter negative selling price → Validation error
   - Leave fields blank → Can still apply
   - Enter very large number (99999999) → Should calculate without breaking

---

## 📊 Summary Checklist

Print and fill out this checklist as you test:

| Phase | Item | Status | Notes |
|-------|------|--------|-------|
| A | Homepage loads | ⬜ | |
| A | Google login works | ⬜ | |
| A | Dashboard accessible | ⬜ | |
| B | Unit Economics calculates | ⬜ | |
| B | Ad Metrics calculates | ⬜ | |
| B | Scale Planner works | ⬜ | |
| B | P&L auto-derives | ⬜ | |
| C | Insights generate | ⬜ | |
| C | Insights show all sections | ⬜ | |
| D | Data persists on refresh | ⬜ | |
| D | Scenarios save/load | ⬜ | |
| E | Brand Vault saves | ⬜ | |
| E | Brand context in insights | ⬜ | |
| F | Meta Ads connects | ⬜ | |
| F | Google Ads connects | ⬜ | |
| F | Ad metrics display | ⬜ | |
| G | Health check API works | ⬜ | |
| G | Insights API works | ⬜ | |
| H | Page loads < 3s | ⬜ | |
| I | Network errors handled | ⬜ | |
| I | Invalid data rejected | ⬜ | |

---

## 🎯 Success Criteria

✅ **All items checked = READY FOR DEPLOYMENT**

❌ **Any item failing = BLOCKING ISSUE**

---

## 📞 Getting Help

| Issue | Solution |
|-------|----------|
| Build fails | `rm -rf .next && npm install && npm run build` |
| Dev server won't start | Check port 3000 available, clear cache |
| Auth not working | Verify Supabase URL/keys in .env |
| API 401 errors | Check auth token, may need to login again |
| Ad integration fails | Verify OAuth credentials, redirect URIs exact match |
| Insights timeout | Check GEMINI_API_KEY, network latency |
| Data not persisting | Check Supabase RLS policies, user_id matches |

