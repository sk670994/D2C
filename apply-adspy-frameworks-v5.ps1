$ErrorActionPreference = "Stop"
$repo = "F:\D2C"
$files = @(
  "components\dashboard\adspy\AdSpySection.tsx",
  "components\dashboard\adspy\components\AdSpySearchBar.tsx",
  "components\dashboard\adspy\components\AdSpyToolbar.tsx",
  "components\dashboard\adspy\components\AdSpyStats.tsx",
  "components\dashboard\adspy\components\AdSpyCreativeCard.tsx",
  "components\dashboard\adspy\components\AdSpyLoadingIntelligence.tsx",
  "components\ui\adspy\ReactBitsAnimatedList.tsx",
  "components\ui\adspy\VengeanceAnimatedNumber.tsx",
  "components\ui\adspy\SkiperReveal.tsx",
  "components\ui\adspy\AnimmasterShowMore.tsx"
)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $repo ("adspy-v5-backup-" + $stamp)
New-Item -ItemType Directory -Force $backup | Out-Null
foreach ($file in $files) {
  $src = Join-Path $repo $file
  if (Test-Path $src) {
    $dst = Join-Path $backup $file
    New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
    Copy-Item $src $dst -Force
  }
}
$bundle = Split-Path -Parent $MyInvocation.MyCommand.Path
foreach ($file in $files) {
  $src = Join-Path $bundle $file
  $dst = Join-Path $repo $file
  New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
  Copy-Item $src $dst -Force
}
Write-Host "AdSpy Framework v5 applied." -ForegroundColor Cyan
Write-Host "Backup: $backup" -ForegroundColor DarkGray
Write-Host "Next: remove .next, then npm run build." -ForegroundColor Yellow
