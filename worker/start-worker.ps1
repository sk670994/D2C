# Zooptrack AdSpy worker - run on your Windows PC in a loop.
#
# Put this file in F:\D2C\worker\ and run from the D2C folder:
#   powershell -ExecutionPolicy Bypass -File worker\start-worker.ps1
#
# What it does:
#   - loads secrets from worker\.env (never commit that file)
#   - installs Chromium for Playwright once
#   - keeps the PC awake while it runs (screen can still turn off)
#   - runs the worker; if it crashes or exits, restarts it after 15 seconds
# Stop it with Ctrl+C (the current job saves what it has first).

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
    [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
  }
}
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
  Write-Host "SUPABASE_SERVICE_ROLE_KEY is empty in worker\.env. Paste it, save, run again." -ForegroundColor Yellow
  exit 1
}

# Worker settings for a PC (these win over worker\.env).
$env:ADSPY_BROWSER = "playwright"
$env:ADSPY_COLLECTOR = "worker"
$env:ADSPY_WORKER_ID = "pc-$env:COMPUTERNAME"
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

# 3. Keep the PC awake while the worker runs -----------------------------------
Add-Type -Namespace Zt -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED (system stays awake, display may sleep)
[Zt.Power]::SetThreadExecutionState([uint32]"0x80000001") | Out-Null

# 4. Loop ----------------------------------------------------------------------
Write-Host ""
Write-Host "Zooptrack worker running as $env:ADSPY_WORKER_ID. Health: http://127.0.0.1:8787/healthz. Ctrl+C to stop." -ForegroundColor Green
try {
  while ($true) {
    $started = Get-Date
    npx tsx worker/adspy-worker.ts
    $code = $LASTEXITCODE
    $ranFor = [int]((Get-Date) - $started).TotalSeconds
    Write-Host "$(Get-Date -Format 'HH:mm:ss') worker exited (code $code after ${ranFor}s). Restarting in 15s... (Ctrl+C to stop)" -ForegroundColor Yellow
    Start-Sleep -Seconds 15
  }
}
finally {
  [Zt.Power]::SetThreadExecutionState([uint32]"0x80000000") | Out-Null  # allow sleep again
}
