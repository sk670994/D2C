$ErrorActionPreference = 'Stop'
$Repo = Get-Location
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Backup = Join-Path $Repo ".adspy-v8-backup-$Timestamp"

$files = @(
  'app/adspy/layout.tsx',
  'components/dashboard/adspy/AdSpySection.tsx',
  'components/dashboard/adspy/adspy-frameworks.css',
  'components/dashboard/adspy/components/AdSpyCreativeCard.tsx',
  'components/dashboard/adspy/components/AdSpyIntelligencePulse.tsx',
  'components/dashboard/adspy/components/AdSpySearchBar.tsx',
  'components/dashboard/adspy/components/AdSpyStats.tsx',
  'components/dashboard/adspy/components/AdSpyToolbar.tsx',
  'components/ui/adspy/AdSpy3DHero.tsx',
  'components/ui/adspy/AdSpyDepthCard.tsx',
  'components/ui/adspy/AnimmasterShowMore.tsx',
  'components/ui/adspy/ReactBitsAnimatedList.tsx'
)

New-Item -ItemType Directory -Path $Backup -Force | Out-Null

foreach ($relative in $files) {
  $source = Join-Path $PSScriptRoot $relative
  $target = Join-Path $Repo $relative
  $parent = Split-Path $target -Parent
  if (!(Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  if (Test-Path $target) {
    $backupTarget = Join-Path $Backup $relative
    $backupParent = Split-Path $backupTarget -Parent
    if (!(Test-Path $backupParent)) { New-Item -ItemType Directory -Path $backupParent -Force | Out-Null }
    Copy-Item $target $backupTarget -Force
  }
  Copy-Item $source $target -Force
  Write-Host "Applied: $relative"
}

Write-Host ""
Write-Host "AdSpy v8 applied. Backup: $Backup"
Write-Host "No new npm dependencies were added."
