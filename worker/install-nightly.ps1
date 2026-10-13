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
$runner = Join-Path $logDir "nightly-run.ps1"
@"
`$ErrorActionPreference = 'Continue'
Set-Location '$root'
`$log = Join-Path '$logDir' ("prefill-" + (Get-Date -Format 'yyyy-MM-dd') + ".log")
"=== start `$(Get-Date -Format s) ===" | Out-File -FilePath `$log -Append -Encoding utf8
git checkout main *>> `$log
git pull --ff-only *>> `$log
# RecentHours 20: every brand not collected in the last 20 h is read again.
powershell -ExecutionPolicy Bypass -File worker\run-prefill.ps1 -RecentHours 20 -Minutes $Minutes *>> `$log
"=== end `$(Get-Date -Format s) ===" | Out-File -FilePath `$log -Append -Encoding utf8
# Keep 30 days of logs.
Get-ChildItem '$logDir' -Filter 'prefill-*.log' | Where-Object { `$_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -ErrorAction SilentlyContinue
"@ | Set-Content -Path $runner -Encoding utf8

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet `
  -WakeToRun `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes ($Minutes + 30)) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description "Zooptrack: full Meta ad collection for tracked, looked-up and seed brands." -Force | Out-Null

Write-Host ""
Write-Host "Done. '$name' runs every night at $Time." -ForegroundColor Green
Write-Host "Logs: $logDir"
Write-Host "Run it now to test:  Start-ScheduledTask -TaskName '$name'"
Write-Host "Missed nights (PC was off) run as soon as the PC is on again."
