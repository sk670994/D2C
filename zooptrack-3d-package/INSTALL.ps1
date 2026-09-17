# Run from PowerShell in F:\D2C after extracting this package.
$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item "$src\lib\theme-tokens.ts" ".\lib\theme-tokens.ts" -Force
New-Item -ItemType Directory -Force ".\components\marketing" | Out-Null
Copy-Item "$src\components\marketing\ZooptrackSite.tsx" ".\components\marketing\ZooptrackSite.tsx" -Force
Copy-Item "$src\components\marketing\ZooptrackSite.module.css" ".\components\marketing\ZooptrackSite.module.css" -Force
New-Item -ItemType Directory -Force ".\app\decision-loop" | Out-Null
New-Item -ItemType Directory -Force ".\app\pricing" | Out-Null
Copy-Item "$src\app\page.tsx" ".\app\page.tsx" -Force
Copy-Item "$src\app\decision-loop\page.tsx" ".\app\decision-loop\page.tsx" -Force
Copy-Item "$src\app\pricing\page.tsx" ".\app\pricing\page.tsx" -Force
Write-Host "Zooptrack 3D marketing foundation installed."
Write-Host "Important: app/adspy/page.tsx is intentionally not overwritten because its Supabase auth + live AdSpy functionality must remain intact."
