$ErrorActionPreference = 'Stop'

$repo = (Get-Location).Path
$patchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$files = @(
    'components/ui/adspy/ReactBitsAnimatedList.tsx',
    'components/ui/adspy/VengeanceAnimatedNumber.tsx',
    'components/ui/adspy/SkiperReveal.tsx',
    'components/ui/adspy/AnimmasterShowMore.tsx',
    'components/dashboard/adspy/components/AdSpyStats.tsx',
    'components/dashboard/adspy/components/AdSpyLoadingIntelligence.tsx',
    'components/dashboard/adspy/components/AdSpyCreativeCard.tsx',
    'components/dashboard/adspy/components/AdSpyToolbar.tsx',
    'components/dashboard/adspy/components/AdSpySearchBar.tsx',
    'components/dashboard/adspy/adspy-motion-grid.css'
)

foreach ($relative in $files) {
    $source = Join-Path $patchRoot $relative
    $target = Join-Path $repo $relative
    $dir = Split-Path -Parent $target
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
    Write-Host "Updated $relative"
}

$section = Join-Path $repo 'components/dashboard/adspy/AdSpySection.tsx'
if (Test-Path $section) {
    $text = Get-Content -Raw -LiteralPath $section

    if ($text -notmatch 'adspy-motion-grid\.css') {
        $text = $text -replace '("use client";\r?\n)', '$1`r`nimport "./adspy-motion-grid.css";`r`n'
    }

    $text = $text.Replace('xl:grid-cols-3', 'xl:grid-cols-5')
    $text = $text.Replace('text-emerald-400', 'text-blue-300')
    $text = $text.Replace('bg-emerald-50', 'bg-blue-50')
    $text = $text.Replace('text-emerald-700', 'text-blue-700')
    $text = $text.Replace('border-emerald-200', 'border-blue-200')
    $text = $text.Replace('bg-emerald-500', 'bg-blue-500')

    Set-Content -LiteralPath $section -Value $text -NoNewline
    Write-Host 'Refined AdSpySection.tsx'
}

$modal = Join-Path $repo 'components/dashboard/adspy/components/AdSpyCreativeModal.tsx'
if (Test-Path $modal) {
    $text = Get-Content -Raw -LiteralPath $modal
    $text = $text.Replace('bg-emerald-50', 'bg-blue-50')
    $text = $text.Replace('text-emerald-700', 'text-blue-700')
    $text = $text.Replace('border-emerald-200', 'border-blue-200')
    $text = $text.Replace('bg-emerald-500', 'bg-blue-500')
    $text = $text.Replace('text-emerald-400', 'text-blue-400')
    Set-Content -LiteralPath $modal -Value $text -NoNewline
    Write-Host 'Refined AdSpyCreativeModal.tsx color states'
}

$remaining = Get-ChildItem -Path (Join-Path $repo 'components/dashboard/adspy'), (Join-Path $repo 'components/ui/adspy') -Recurse -File -ErrorAction SilentlyContinue |
    Select-String -Pattern 'emerald|teal|#0d9488|#0f766e|#14b8a6|#16a34a|#059669' -CaseSensitive:$false

if ($remaining) {
    Write-Warning 'Some green/teal references remain. Review the paths below:'
    $remaining | ForEach-Object { Write-Host "$($_.Path):$($_.LineNumber) $($_.Line.Trim())" }
} else {
    Write-Host 'No green/teal references found in AdSpy motion files.'
}

Write-Host ''
Write-Host 'Next: run `npm run lint` and `npm run build` from the repo root.'
