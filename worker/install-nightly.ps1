# Zooptrack: run the full ad collection on this PC every night, by itself.
#
# Run ONCE from the D2C folder (normal PowerShell, no admin needed):
#   powershell -ExecutionPolicy Bypass -File worker\install-nightly.ps1
#   powershell -ExecutionPolicy Bypass -File worker\install-nightly.ps1 -Time "01:30"
# Remove it again:
#   powershell -ExecutionPolicy Bypass -File worker\install-nightly.ps1 -Remove
#
# What it does: a Windows scheduled task "Zooptrack nightly collection" that
# starts worker\run-prefill.ps1 at the given time (default 01:00), wakes the
# PC from sleep for it, and writes a log per night to
#   %LOCALAPPDATA%\zooptrack\logs\prefill-YYYY-MM-DD.log
# Needs: PC switched on or asleep (not shut down), plugged in, you logged in.
param(
  [string]$Time = "01:00",
  [int]$Minutes = 360,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$name = "Zooptrack nightly collection"

if ($Remove) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed '$name'."
  exit 0
}

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:LOCALAPPDATA "zooptrack\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Small wrapper: pull the latest code, run the collection, keep a dated log.
$runner = Join-Path $logDir "nightly-run.cmd"
# A .cmd wrapper: cmd's own ">>" writes plain UTF-8 (PowerShell's "*>>"
# mixed UTF-8 and UTF-16 and split every line) and it needs no visible
# window to keep running. The first line is written before anything else,
# so a run that fails to start still leaves a trace.
@"
@echo off
cd /d "$root"
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set D=%%d
set LOG=$logDir\prefill-%D%.log
echo === start %DATE% %TIME% ===>> "%LOG%"
git checkout main >> "%LOG%" 2>&1
git pull --ff-only >> "%LOG%" 2>&1
rem RecentHours 20: every brand not collected in the last 20 h is read again.
powershell -NoProfile -ExecutionPolicy Bypass -File worker\run-prefill.ps1 -RecentHours 20 -Minutes $Minutes >> "%LOG%" 2>&1
set RC=%ERRORLEVEL%
echo === end %DATE% %TIME% exit %RC% ===>> "%LOG%"
forfiles /p "$logDir" /m prefill-*.log /d -30 /c "cmd /c del @path" >nul 2>&1
rem The task result is the collection's exit code (forfiles returns 1 when no old log exists).
exit /b %RC%
"@ | Set-Content -Path $runner -Encoding ascii
Remove-Item (Join-Path $logDir "nightly-run.ps1") -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$runner`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
# Time limit = collection budget + 60 min: git pull, npm, up to 15 min of
# database waits and the last image copy, so Windows never kills a brand
# mid-scan (a cut scan never marks stopped ads, but wastes the brand).
$settings = New-ScheduledTaskSettingsSet `
  -WakeToRun `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes ($Minutes + 60)) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description "Zooptrack: full Meta ad collection for tracked, looked-up and seed brands." -Force | Out-Null

Write-Host ""
Write-Host "Done. '$name' runs every night at $Time." -ForegroundColor Green
Write-Host "Logs: $logDir"
Write-Host "Run it now to test:  Start-ScheduledTask -TaskName '$name'"
Write-Host "Never run long collections inside VS Code: it restarts for updates and kills them."
Write-Host "Missed nights (PC was off) run as soon as the PC is on again."
