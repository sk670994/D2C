$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backup = Join-Path (Get-Location) ("adspy-v20-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

$Targets = @(
  "components\dashboard\adspy\AdSpySection.tsx",
  "components\dashboard\adspy\components\AdSpyCreativeModal.tsx"
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
  if (-not (Test-Path $src)) { throw "Missing v20 file: $target" }
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item $src $dst -Force
}

Write-Host "AdSpy v20 applied."
Write-Host "Backup: $Backup"
