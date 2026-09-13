$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backup = Join-Path (Get-Location) ("adspy-v12-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

$Targets = @(
  "app\adspy\layout.tsx",
  "components\dashboard\adspy\AdSpySection.tsx",
  "components\dashboard\adspy\adspy-uiux-v12.css",
  "components\dashboard\adspy\components\AdSpySearchBar.tsx",
  "components\dashboard\adspy\components\AdSpyCreativeCard.tsx",
  "public\adspy\icons\close.svg",
  "public\adspy\icons\play.svg"
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
  if (-not (Test-Path $src)) { throw "Missing v12 file: $target" }
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item $src $dst -Force
}

Write-Host "AdSpy v12 applied."
Write-Host "Backup: $Backup"
