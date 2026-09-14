$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = Join-Path $Root "adspy-v9-backup-$Stamp"

$Targets = @(
  "app\adspy\page.tsx",
  "app\adspy\layout.tsx",
  "components\dashboard\adspy\components\AdSpyStats.tsx",
  "components\dashboard\adspy\components\AdSpySearchBar.tsx",
  "components\dashboard\adspy\components\AdSpyToolbar.tsx",
  "components\dashboard\adspy\components\AdSpyCreativeCard.tsx",
  "components\dashboard\adspy\components\AdSpyIntelligencePulse.tsx",
  "components\dashboard\adspy\adspy-uiux-v9.css",
  "components\ui\adspy\AdSpy3DAtmosphere.tsx",
  "components\ui\adspy\AdSpyDepthCard.tsx",
  "components\ui\adspy\VengeanceAnimatedNumber.tsx",
  "components\ui\adspy\ReactBitsAnimatedList.tsx",
  "components\ui\adspy\SkiperReveal.tsx",
  "components\ui\adspy\AnimmasterShowMore.tsx"
)

Write-Host "Creating backup: $Backup"
foreach ($target in $Targets) {
  $destination = Join-Path $Root $target
  if (Test-Path $destination) {
    $backupPath = Join-Path $Backup $target
    New-Item -ItemType Directory -Force -Path (Split-Path $backupPath) | Out-Null
    Copy-Item $destination $backupPath -Force
  }
}

foreach ($target in $Targets) {
  $source = Join-Path $Root $target
  if (Test-Path $source) {
    # Source already points at repo-relative location if archive was extracted over F:\D2C.
    continue
  }
}

Write-Host ""
Write-Host "This script expects the archive to have been extracted directly over F:\D2C."
Write-Host "Backup created. If you are seeing this from the archive root, copy the files manually or re-extract the archive over the repo."
Write-Host "Done."
