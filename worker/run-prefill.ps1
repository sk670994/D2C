# Zooptrack local nightly Meta Ad Library collector.
# Replace F:\D2C\worker\run-prefill.ps1 with this file.
#
# Normal collection (the scheduled task calls this):
#   powershell -NoProfile -ExecutionPolicy Bypass -File worker\run-prefill.ps1 -RecentHours 20 -Minutes 360
# Safe setup check; does NOT run the collector or contact Supabase:
#   powershell -NoProfile -ExecutionPolicy Bypass -File worker\run-prefill.ps1 -CheckOnly
#
# The server-only bypass is scoped to Node processes launched by this worker.
# It does not edit node_modules or affect the Next.js web app.

param(
  [string]$Brands = "",
  [ValidateRange(0, 8760)]
  [int]$RecentHours = 120,
  [ValidateRange(5, 720)]
  [int]$Minutes = 300,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

function Stop-Worker {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [int]$ExitCode = 1
  )
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit $ExitCode
}

# 1. Load worker secrets from worker\.env without printing any secret values.
$envFile = Join-Path $root "worker\.env"
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  Stop-Worker "worker\.env does not exist. Create it from worker\env.example, fill in the required values, and try again."
}

Get-Content -LiteralPath $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $equalsAt = $line.IndexOf("=")
  if ($equalsAt -le 0) { return }

  $name = $line.Substring(0, $equalsAt).Trim()
  $value = $line.Substring($equalsAt + 1).Trim()
  if ($value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
       ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

$missing = @()
if ([string]::IsNullOrWhiteSpace($env:NEXT_PUBLIC_SUPABASE_URL)) { $missing += "NEXT_PUBLIC_SUPABASE_URL" }
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_SERVICE_ROLE_KEY)) { $missing += "SUPABASE_SERVICE_ROLE_KEY" }
if ([string]::IsNullOrWhiteSpace($env:ADSPY_SYSTEM_USER_ID)) { $missing += "ADSPY_SYSTEM_USER_ID" }
if ($missing.Count -gt 0) {
  Stop-Worker ("Missing required value(s) in worker\.env: " + ($missing -join ", ") + ". No collection was started.")
}

# 2. Require the Node version this repository declares (Node 22.x).
$nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
if (-not $nodeCommand) { $nodeCommand = Get-Command "node" -ErrorAction SilentlyContinue }
if (-not $nodeCommand) { Stop-Worker "Node.js was not found on PATH. Install Node.js 22.x, reopen PowerShell, and retry." }

$nodeVersion = & $nodeCommand.Source -v
$nodeVersionExit = $LASTEXITCODE
if ($nodeVersionExit -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') {
  Stop-Worker "Could not determine the Node.js version. Output: $nodeVersion"
}
$nodeMajor = [int]$Matches[1]
if ($nodeMajor -ne 22) {
  Stop-Worker "This repository declares Node.js 22.x. Found $nodeVersion. Switch this scheduled task to Node 22.x before collecting."
}

# 3. Install project dependencies only if the local CLIs are missing.
$tsxCommand = Join-Path $root "node_modules\.bin\tsx.cmd"
$playwrightCommand = Join-Path $root "node_modules\.bin\playwright-core.cmd"
if (-not (Test-Path -LiteralPath $tsxCommand -PathType Leaf) -or
    -not (Test-Path -LiteralPath $playwrightCommand -PathType Leaf)) {
  $npmCommand = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
  if (-not $npmCommand) { $npmCommand = Get-Command "npm" -ErrorAction SilentlyContinue }
  if (-not $npmCommand) { Stop-Worker "npm was not found on PATH; dependencies cannot be installed." }

  Write-Host "Local worker dependencies are missing; running npm ci..."
  & $npmCommand.Source ci --no-audit --no-fund --include=dev
  $npmExitCode = $LASTEXITCODE
  if ($npmExitCode -ne 0) { Stop-Worker "npm ci failed with exit code $npmExitCode. No collection was started." $npmExitCode }
}

if (-not (Test-Path -LiteralPath $tsxCommand -PathType Leaf)) {
  Stop-Worker "Local tsx launcher is still missing after dependency installation: $tsxCommand"
}
if (-not (Test-Path -LiteralPath $playwrightCommand -PathType Leaf)) {
  Stop-Worker "Local Playwright CLI is missing after dependency installation: $playwrightCommand"
}

# Install Chromium once. Write the marker only when the installer succeeds.
$stateDir = Join-Path $env:LOCALAPPDATA "zooptrack"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$chromiumMarker = Join-Path $env:LOCALAPPDATA "zooptrack-chromium-installed"
if (-not (Test-Path -LiteralPath $chromiumMarker -PathType Leaf)) {
  Write-Host "Installing Playwright Chromium (first run only; this may take a few minutes)..."
  & $playwrightCommand install chromium
  $browserInstallExit = $LASTEXITCODE
  if ($browserInstallExit -ne 0) { Stop-Worker "Playwright Chromium installation failed with exit code $browserInstallExit. No collection was started." $browserInstallExit }
  New-Item -ItemType File -Force -Path $chromiumMarker | Out-Null
}

# 4. Worker settings: free local Playwright collection, not paid API credits.
$env:ADSPY_BROWSER = "playwright"
$env:ADSPY_COLLECTOR = "worker"
$env:ADSPY_META_SOURCE = "playwright"
$env:NODE_ENV = "production"
# Standalone worker imports Next.js server modules. Select the server export explicitly;
# do not patch node_modules/server-only/index.js (that file is an intentional guard).
if ($env:NODE_OPTIONS -notmatch '(^|\s)--conditions(?:=|\s+)react-server(\s|$)') {
  $env:NODE_OPTIONS = (($env:NODE_OPTIONS + " --conditions=react-server").Trim())
}
$env:ADSPY_PREFILL_BRANDS = $Brands
$env:ADSPY_PREFILL_RECENT_HOURS = "$RecentHours"
$env:ADSPY_PREFILL_MINUTES = "$Minutes"
$env:ADSPY_WORKER_BUDGET_MS = "2400000" # 40 minutes maximum for one brand/page
$env:ADSPY_DEEP_MAX_SCROLLS = "360"
$env:ADSPY_STORE_MEDIA = "1"
$env:ADSPY_DEFER_MEDIA = "1"
$env:ADSPY_MEDIA_CONCURRENCY = "12"
$env:DB_FETCH_RETRIES = "4"
$env:ADSPY_WORKER_MIN_TMP_MB = "512"

# Chromium profiles/temp files use a dedicated folder; no project files are cleaned.
$workerTmp = Join-Path $env:LOCALAPPDATA "zooptrack-worker-tmp"
New-Item -ItemType Directory -Force -Path $workerTmp | Out-Null
$env:TEMP = $workerTmp
$env:TMP = $workerTmp
$env:TMPDIR = $workerTmp

# 5. Standalone Node worker compatibility.
# Next's `server-only` marker deliberately throws on its default package entry.
# The standalone collector is server-side, so intercept only this marker in
# Node processes launched by this worker. Do NOT rewrite node_modules: that
# can break after npm ci and can leave the web app's dependency tree modified.
$preloadPath = Join-Path $stateDir "server-only-worker-preload.cjs"
$preloadCode = @'
"use strict";
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};
'@
Set-Content -LiteralPath $preloadPath -Value $preloadCode -Encoding ASCII

$hadNodeOptions = Test-Path Env:NODE_OPTIONS
$originalNodeOptions = $env:NODE_OPTIONS
$preloadPathForNode = $preloadPath.Replace('\', '/')
$preloadOption = '--require="' + $preloadPathForNode + '"'
if ([string]::IsNullOrWhiteSpace($originalNodeOptions)) {
  $env:NODE_OPTIONS = $preloadOption
} else {
  $env:NODE_OPTIONS = $originalNodeOptions.Trim() + " " + $preloadOption
}

$collectorExitCode = 1
$powerManagementActive = $false
try {
  # Safe test: prove the targeted shim is active before opening the collector.
  $preloadProbe = "require('server-only'); console.log('server-only worker preload OK')"
  & $nodeCommand.Source -e $preloadProbe
  $shimTestExitCode = $LASTEXITCODE
  if ($shimTestExitCode -ne 0) {
    throw "Worker preload test failed with exit code $shimTestExitCode. Collector was not started."
  }

  if ($CheckOnly) {
    Write-Host "Preflight passed. Required configuration, Node 22, local CLIs, Chromium marker, and worker shim were checked."
    Write-Host "CheckOnly is enabled: no ad collection was started and no Supabase request was made by this script."
    $collectorExitCode = 0
  } else {
    # Keep the PC awake while the collector runs (the display can still sleep).
    if (-not ("Zt.Power" -as [type])) {
      Add-Type -Namespace Zt -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
    }
    [Zt.Power]::SetThreadExecutionState([uint32]"0x80000001") | Out-Null
    $powerManagementActive = $true

    Write-Host "Starting Zooptrack local Meta collector at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
    Write-Host "Collection budget: $Minutes minute(s); recent-brand skip window: $RecentHours hour(s)."
    Write-Host "Collector source: local Playwright; ScrapeCreators/API credits are not used by this worker."

    & $tsxCommand "scripts/adspy-prefill.ts"
    $collectorExitCode = $LASTEXITCODE
    if ($null -eq $collectorExitCode) { $collectorExitCode = 1 }
    Write-Host "Collector process exit code: $collectorExitCode"
  }
} catch {
  Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
  $collectorExitCode = 1
} finally {
  if ($powerManagementActive) {
    try { [Zt.Power]::SetThreadExecutionState([uint32]"0x80000000") | Out-Null }
    catch { Write-Host ("WARNING: could not restore the PC sleep state: " + $_.Exception.Message) -ForegroundColor Yellow }
  }
  # Restore the caller's Node options even if the collector crashes.
  if ($hadNodeOptions) {
    $env:NODE_OPTIONS = $originalNodeOptions
  } else {
    Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  }
}

if ($collectorExitCode -ne 0) {
  Write-Host "Zooptrack nightly collector FAILED (exit code $collectorExitCode). Check this run's log before retrying." -ForegroundColor Red
  exit $collectorExitCode
}
if ($CheckOnly) {
  Write-Host "Zooptrack worker preflight SUCCEEDED. No collection was run." -ForegroundColor Green
} else {
  Write-Host "Zooptrack nightly collector process finished successfully. Review the summary above/log to confirm how many brands and ads were processed." -ForegroundColor Green
}
exit 0
