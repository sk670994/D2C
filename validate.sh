#!/bin/bash

# D2C Application Quick Validation Script
# Run this to verify everything is set up correctly

echo "╔════════════════════════════════════════╗"
echo "║  D2C App - Quick Validation Script     ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0

# Function to check status
check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $1"
        ((FAILED++))
    fi
}

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} File exists: $1"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} File missing: $1"
        ((FAILED++))
    fi
}

# Function to check env var
check_env() {
    if [ -n "${!1}" ]; then
        echo -e "${GREEN}✓${NC} ENV: $1 is set"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠${NC} ENV: $1 is NOT set"
        ((FAILED++))
    fi
}

echo "1. Checking Project Structure..."
check_file "package.json"
check_file "tsconfig.json"
check_file "next.config.ts"
check_file "app/page.tsx"
check_file "app/dashboard/page.tsx"
check_file "app/login/page.tsx"
check_file "app/brand-vault/page.tsx"
check_file "lib/supabase/client.ts"
check_file "lib/supabase/server.ts"
check_file "lib/llm/insights.ts"
check_file "AD_INTEGRATION_SETUP.md"
check_file "TESTING_GUIDE.md"
echo ""

echo "2. Checking Environment Variables..."
check_env "NEXT_PUBLIC_SUPABASE_URL"
check_env "NEXT_PUBLIC_SUPABASE_ANON_KEY"
check_env "SUPABASE_SERVICE_ROLE_KEY"
check_env "GEMINI_API_KEY"
check_env "GEMINI_MODEL"
check_env "NEXT_PUBLIC_ADMIN_EMAIL"
echo ""

echo "3. Checking Node Dependencies..."
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules exists"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} node_modules missing - run: npm install"
    ((FAILED++))
fi
echo ""

echo "4. Checking Build..."
npm run build > /dev/null 2>&1
check "Production build"
echo ""

echo "5. Checking TypeScript..."
npx tsc --noEmit > /dev/null 2>&1
check "TypeScript compilation"
echo ""

echo "6. Checking API Routes..."
check_file "app/api/insights/route.ts"
check_file "app/api/brand-vault/route.ts"
check_file "app/api/integrations/meta-ads/route.ts"
check_file "app/api/integrations/google-ads/route.ts"
check_file "app/api/cron/fetch-ad-data/route.ts"
echo ""

echo "7. Checking Database Files..."
check_file "supabase-schema.sql"
echo ""

echo "8. Checking Configuration Files..."
check_file "vercel.json"
check_file "globals.css"
echo ""

echo "═════════════════════════════════════════"
echo -e "Results: ${GREEN}$PASSED Passed${NC} | ${RED}$FAILED Failed${NC}"
echo "═════════════════════════════════════════"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready to test.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start dev server: npm run dev"
    echo "2. Open: http://localhost:3000"
    echo "3. Follow TESTING_GUIDE.md for detailed testing"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Please fix issues above.${NC}"
    exit 1
fi
