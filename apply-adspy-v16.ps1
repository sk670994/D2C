$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backup = Join-Path (Get-Location) ("adspy-v16-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

$Targets = @(
  "components\dashboard\adspy\AdSpySection.tsx",
  "components\dashboard\adspy\components\AdSpyCreativeCard.tsx",
  "components\dashboard\adspy\components\AdSpySearchBar.tsx",
  "components\dashboard\adspy\components\AdSpy3DJokePulse.tsx",
  "components\dashboard\adspy\components\AdSpy3DCreativeReel.tsx",
  "components\dashboard\adspy\adspy-uiux-v16.css",
  "app\adspy\layout.tsx"
)

foreach ($target in $Targets) {
  $dst = Join-Path (Get-Location) $target
  if (Test-Path $dst) {
    $b = Join-Path $Backup $target
    New-Item -ItemType Directory -Force -Path (Split-Path $b) | Out-Null
    Copy-Item $dst $b -Force
  }
}

foreach ($target in $Targets) {
  $src = Join-Path $Root $target
  $dst = Join-Path (Get-Location) $target
  if (-not (Test-Path $src)) { throw "Missing v16 file: $target" }
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item $src $dst -Force
}

Write-Host "AdSpy v16 applied."
Write-Host "Backup: $Backup"
