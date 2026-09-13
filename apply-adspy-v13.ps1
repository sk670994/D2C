$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = Join-Path (Get-Location) "adspy-v13-backup-$Stamp"

$Targets = @(
  "components\dashboard\adspy\AdSpySection.tsx",
  "components\dashboard\adspy\adspy-uiux-v13.css",
  "components\dashboard\adspy\components\AdSpySearchBar.tsx",
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
  if (-not (Test-Path $src)) { throw "Missing v13 file: $target" }
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item $src $dst -Force
}

Write-Host "AdSpy v13 applied."
Write-Host "Backup: $Backup"
