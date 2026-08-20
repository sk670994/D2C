# D2C Application Quick Validation Script (Windows PowerShell)
# Run this to verify everything is set up correctly

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   D2C App - Quick Validation Script      " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Track results
$PASSED = 0
$FAILED = 0

# Function to check status
function Check-Status {
    param([string]$Message, [bool]$IsSuccess)
    if ($IsSuccess) {
        Write-Host "[OK] $Message" -ForegroundColor Green
        $global:PASSED++
    } else {
        Write-Host "[FAIL] $Message" -ForegroundColor Red
        $global:FAILED++
    }
}

# Function to check file exists
function Check-File {
    param([string]$FilePath)
    $exists = Test-Path $FilePath
    Check-Status "File: $FilePath" $exists
}

# Function to check env var
function Check-Env {
    param([string]$VarName)
    $value = [Environment]::GetEnvironmentVariable($VarName)
    
    if (-not $value -and (Test-Path ".env.local")) {
        $lines = Get-Content ".env.local"
        foreach ($line in $lines) {
            if ($line -match "^\s*${VarName}\s*=") {
                # Simple extraction of everything after the equals sign
                $parts = $line -split '=', 2
                if ($parts.Length -eq 2) {
                    $value = $parts[1].Trim()
                }
                break
            }
        }
    }
    
    if ($value) {
        Write-Host "[OK] ENV: $VarName is set" -ForegroundColor Green
        $global:PASSED++
    } else {
        Write-Host "[WARN] ENV: $VarName is NOT set" -ForegroundColor Yellow
    }
}

Write-Host "1. Checking Project Structure..." -ForegroundColor Cyan
Check-File "package.json"
Check-File "tsconfig.json"
Check-File "next.config.ts"
Check-File "app/page.tsx"
Check-File "app/dashboard/page.tsx"
Check-File "app/login/page.tsx"
Check-File "app/brand-vault/page.tsx"
Check-File "lib/supabase/client.ts"
Check-File "lib/supabase/server.ts"
Check-File "lib/llm/insights.ts"
Check-File "AD_INTEGRATION_SETUP.md"
Check-File "TESTING_GUIDE.md"
Write-Host ""

Write-Host "2. Checking Environment Variables..." -ForegroundColor Cyan
Check-Env "NEXT_PUBLIC_SUPABASE_URL"
Check-Env "NEXT_PUBLIC_SUPABASE_ANON_KEY"
Check-Env "SUPABASE_SERVICE_ROLE_KEY"
Check-Env "GEMINI_API_KEY"
Check-Env "GEMINI_MODEL"
Check-Env "NEXT_PUBLIC_ADMIN_EMAIL"
Write-Host ""

Write-Host "3. Checking Node Dependencies..." -ForegroundColor Cyan
$nodeModulesExists = Test-Path "node_modules"
if ($nodeModulesExists) {
    Write-Host "[OK] node_modules exists" -ForegroundColor Green
    $global:PASSED++
} else {
    Write-Host "[FAIL] node_modules missing - run: npm install" -ForegroundColor Red
    $global:FAILED++
}
Write-Host ""

Write-Host "4. Checking Build..." -ForegroundColor Cyan
try {
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Check-Status "Production build" $true
    } else {
        Check-Status "Production build" $false
    }
} catch {
    Check-Status "Production build" $false
}
Write-Host ""

Write-Host "5. Checking TypeScript..." -ForegroundColor Cyan
try {
    npx tsc --noEmit
    if ($LASTEXITCODE -eq 0) {
        Check-Status "TypeScript compilation" $true
    } else {
        Check-Status "TypeScript compilation" $false
    }
} catch {
    Check-Status "TypeScript compilation" $false
}
Write-Host ""

Write-Host "6. Checking API Routes..." -ForegroundColor Cyan
Check-File "app/api/insights/route.ts"
Check-File "app/api/brand-vault/route.ts"
Check-File "app/api/integrations/meta-ads/route.ts"
Check-File "app/api/integrations/google-ads/route.ts"
Check-File "app/api/cron/fetch-ad-data/route.ts"
Write-Host ""

Write-Host "7. Checking Database Files..." -ForegroundColor Cyan
Check-File "supabase-schema.sql"
Write-Host ""

Write-Host "8. Checking Configuration Files..." -ForegroundColor Cyan
Check-File "vercel.json"
Check-File "app/globals.css"
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host -NoNewline "Results: " -ForegroundColor Cyan
Write-Host -NoNewline $PASSED -ForegroundColor Green
Write-Host -NoNewline " Passed | " -ForegroundColor Cyan
Write-Host -NoNewline $FAILED -ForegroundColor Red
Write-Host " Failed" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

if ($FAILED -eq 0) {
    Write-Host "[OK] All checks passed! Ready to test." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Start dev server: npm run dev"
    Write-Host "2. Open: http://localhost:3000"
    Write-Host "3. Follow TESTING_GUIDE.md for detailed testing"
} else {
    Write-Host "[FAIL] Some checks failed. Please fix issues above." -ForegroundColor Red
}
