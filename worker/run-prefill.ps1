# Zooptrack nightly pre-fill, run on your Windows PC instead of GitHub.
#
# Why: Meta rate-limits the Ad Library for cloud servers. From GitHub every
# "load more" request came back "Rate limit exceeded" (run #27, 11 Oct), so
# each brand stopped at its first 30 ads. A home connection is not limited.
#
# Run from the D2C folder (needs ADSPY_SYSTEM_USER_ID in worker\.env):
#   powershell -ExecutionPolicy Bypass -File worker\run-prefill.ps1
#   powershell -ExecutionPolicy Bypass -File worker\run-prefill.ps1 -Brands "Mamaearth, Kapiva" -RecentHours 0
param(
  [string]$Brands = "",
  [int]$RecentHours = 120,
  [int]$Minutes = 300
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1. Secrets ---------------------------------------------------------------
$envFile = Join-Path $root "worker\.env"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $root "worker\env.example") $envFile
  Write-Host ""
  Write-Host "Created worker\.env. Open it, paste your SUPABASE_SERVICE_ROLE_KEY, save, then run this script again." -ForegroundColor Yellow
  Write-Host "(Supabase > Project Settings > API Keys > service_role / secret key)"
  exit 1
}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $name, $value = $line.Split("=", 2)
    $value = $value.Trim()
    # KEY="value" or KEY='value': drop the quotes, they are not part of the value.
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name.Trim(), $value, "Process")
  }
}
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
  Write-Host "SUPABASE_SERVICE_ROLE_KEY is empty in worker\.env. Paste it, save, run again." -ForegroundColor Yellow
  exit 1
}

# Worker settings for a PC (these win over worker\.env).
$env:ADSPY_BROWSER = "playwright"
$env:ADSPY_COLLECTOR = "worker"
$env:NODE_ENV = "production"
# "server-only" is bundled inside Next.js, not installed as a package, so the
# worker (plain Node) cannot find it. Give Node an empty stand-in, exactly as
# the Docker image does. Local only; node_modules is never committed.
$so = Join-Path $root "node_modules\server-only"
if (-not (Test-Path (Join-Path $so "index.js"))) {
  New-Item -ItemType Directory -Force -Path $so | Out-Null
  Set-Content -Path (Join-Path $so "package.json") -Value '{"name":"server-only","version":"0.0.1","main":"index.js"}'
  Set-Content -Path (Join-Path $so "index.js") -Value ''
}
# Chromium profiles go to a dedicated temp folder the worker may clean.
$tmp = Join-Path $env:LOCALAPPDATA "zooptrack-worker-tmp"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$env:TEMP = $tmp; $env:TMP = $tmp; $env:TMPDIR = $tmp
$env:ADSPY_WORKER_MIN_TMP_MB = "512"

# 2. Requirements (once) -----------------------------------------------------
$nodeMajor = [int]((node -v).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) { Write-Host "Node 20+ needed (you have $(node -v)). Install Node 22 LTS from nodejs.org." -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $root "node_modules\tsx"))) {
  Write-Host "Installing packages (first run only)..."
  npm ci --no-audit --no-fund --include=dev
}
$marker = Join-Path $env:LOCALAPPDATA "zooptrack-chromium-installed"
if (-not (Test-Path $marker)) {
  Write-Host "Installing Chromium for Playwright (first run only, ~150 MB)..."
  npx playwright-core install chromium
  New-Item -ItemType File -Force -Path $marker | Out-Null
}

if (-not $env:ADSPY_SYSTEM_USER_ID) {
  Write-Host "Add ADSPY_SYSTEM_USER_ID=<same value as the GitHub secret> to worker\.env, save, run again." -ForegroundColor Yellow
  exit 1
}
$env:ADSPY_PREFILL_BRANDS = $Brands
$env:ADSPY_PREFILL_RECENT_HOURS = "$RecentHours"
$env:ADSPY_PREFILL_MINUTES = "$Minutes"
$env:ADSPY_WORKER_BUDGET_MS = "2400000"  # Kapiva (~1,400 live ads) needs ~30 min
$env:ADSPY_DEEP_MAX_SCROLLS = "360"
# Save ads first, copy images right after each brand (not inside every save).
$env:ADSPY_STORE_MEDIA = "1"
$env:ADSPY_DEFER_MEDIA = "1"
$env:ADSPY_MEDIA_CONCURRENCY = "12"

# Keep the PC awake while it runs (display may sleep).
Add-Type -Namespace Zt -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
[Zt.Power]::SetThreadExecutionState([uint32]"0x80000001") | Out-Null
try {
  npx tsx scripts/adspy-prefill.ts
}
finally {
  [Zt.Power]::SetThreadExecutionState([uint32]"0x80000000") | Out-Null
}
