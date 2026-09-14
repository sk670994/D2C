$ErrorActionPreference = "Stop"

$sectionPath = ".\components\dashboard\adspy\AdSpySection.tsx"

if (-not (Test-Path $sectionPath)) {
  throw "Could not find $sectionPath"
}

$content = Get-Content $sectionPath -Raw

# These three identifiers were left over from the previous inline implementation.
# Remove only the declaration blocks/lines when they are no longer referenced.
$content = [regex]::Replace(
  $content,
  '(?ms)^\s*const\s+truncate\s*=\s*\(.*?\n\s*\};\s*\r?\n',
  ''
)

$content = [regex]::Replace(
  $content,
  '(?m)^\s*const\s+intelligence\s*=\s*.*\r?\n',
  ''
)

$content = [regex]::Replace(
  $content,
  '(?m)^\s*const\s+trackingLoading\s*=\s*.*\r?\n',
  ''
)

Set-Content -Path $sectionPath -Value $content -Encoding UTF8

Write-Host "Cleaned unused AdSpySection declarations."
