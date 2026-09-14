$ErrorActionPreference = "Stop"
$repo = (Get-Location).Path
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = Join-Path $repo "adspy-framework-v6-backup-$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
$files = @(
  "app/adspy/layout.tsx",
  "components/dashboard/adspy/AdSpySection.tsx",
  "components/dashboard/adspy/components/AdSpySearchBar.tsx",
  "components/dashboard/adspy/components/AdSpyToolbar.tsx",
  "components/dashboard/adspy/components/AdSpyStats.tsx",
  "components/dashboard/adspy/components/AdSpyCreativeCard.tsx",
  "components/dashboard/adspy/components/AdSpyLoadingIntelligence.tsx",
  "components/ui/adspy/ReactBitsAnimatedList.tsx",
  "components/ui/adspy/VengeanceAnimatedNumber.tsx",
  "components/ui/adspy/SkiperReveal.tsx",
  "components/ui/adspy/AnimmasterShowMore.tsx",
  "components/dashboard/adspy/components/AdSpyIntelligencePulse.tsx",
  "components/dashboard/adspy/adspy-frameworks.css"
)
foreach ($file in $files) { $src=Join-Path $repo $file; if(Test-Path $src){ Copy-Item $src (Join-Path $backup ($file -replace '/','__')) -Force } }
Write-Host "Backup: $backup"
Write-Host "v6 files are included in this archive. Extract this archive over F:\D2C, replacing files."
