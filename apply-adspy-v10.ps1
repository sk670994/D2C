$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = (Get-Location).Path
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = Join-Path $Repo "adspy-v10-backup-$Stamp"

$Targets = @(
  "app\adspy\page.tsx",
  "app\adspy\layout.tsx",
  "components\dashboard\adspy\AdSpySection.tsx",
  "components\dashboard\adspy\adspy-uiux-v9.css",
  "components\dashboard\adspy\components\AdSpySearchBar.tsx",
  "components\dashboard\adspy\components\AdSpyToolbar.tsx",
  "components\dashboard\adspy\components\AdSpyStats.tsx",
  "components\dashboard\adspy\components\AdSpyCreativeCard.tsx",
  "components\dashboard\adspy\components\AdSpyIntelligencePulse.tsx",
  "components\ui\adspy\AdSpy3DHero.tsx",
  "components\ui\adspy\AdSpy3DAtmosphere.tsx",
  "components\ui\adspy\AdSpyDepthCard.tsx",
  "components\ui\adspy\VengeanceAnimatedNumber.tsx",
  "components\ui\adspy\ReactBitsAnimatedList.tsx",
  "components\ui\adspy\SkiperReveal.tsx",
  "components\ui\adspy\AnimmasterShowMore.tsx"
)

Write-Host "Backup: $Backup"
foreach ($target in $Targets) {
  $dest = Join-Path $Repo $target
  if (Test-Path $dest) {
    $backup = Join-Path $Backup $target
    New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
    Copy-Item $dest $backup -Force
  }
}

foreach ($target in $Targets) {
  $src = Join-Path $Root $target
  if (-not (Test-Path $src)) { throw "Missing archive file: $target" }
  $dest = Join-Path $Repo $target
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item $src $dest -Force
}

Write-Host "AdSpy v10 applied. Backup created at $Backup"
