$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$files = @(
  'components/ui/adspy/ReactBitsAnimatedList.tsx',
  'components/ui/adspy/VengeanceAnimatedNumber.tsx',
  'components/ui/adspy/SkiperReveal.tsx',
  'components/ui/adspy/AnimmasterShowMore.tsx',
  'components/dashboard/adspy/components/AdSpyLoadingIntelligence.tsx',
  'components/dashboard/adspy/components/AdSpyStats.tsx',
  'components/dashboard/adspy/components/AdSpyCreativeCard.tsx',
  'components/dashboard/adspy/components/AdSpySearchBar.tsx',
  'components/dashboard/adspy/components/AdSpyToolbar.tsx'
)

foreach ($relative in $files) {
  $source = Join-Path $root $relative
  $target = Join-Path $repo $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Host "Updated $relative"
}

$section = Join-Path $repo 'components/dashboard/adspy/AdSpySection.tsx'
if (-not (Test-Path $section)) { throw "Missing $section" }

$text = Get-Content -Raw -LiteralPath $section
$text = $text -replace 'import \{ AdSpyAutocomplete \} from "\./AdSpyAutocomplete";\r?\n', ''
$text = $text -replace '(import \{ AdSpyAnalysis \} from "\./AdSpyAnalysis";)', '$1`r`nimport { AdSpyCreativeCard } from "./components/AdSpyCreativeCard";`r`nimport { AdSpyLoadingIntelligence } from "./components/AdSpyLoadingIntelligence";`r`nimport { AdSpySearchBar } from "./components/AdSpySearchBar";`r`nimport { AdSpyStats } from "./components/AdSpyStats";`r`nimport { AdSpyToolbar } from "./components/AdSpyToolbar";'

$statStart = $text.IndexOf('function Stat(')
$propsStart = $text.IndexOf('export type AdSpySectionProps')
if ($statStart -ge 0 -and $propsStart -gt $statStart) {
  $text = $text.Remove($statStart, $propsStart - $statStart)
}

$searchStart = $text.IndexOf('        <div className="mt-6 grid gap-3 lg:grid-cols-[150px_1fr_110px_auto]">')
$errorStart = $text.IndexOf('      {error ?')
if ($searchStart -ge 0 -and $errorStart -gt $searchStart) {
  $replacement = @'
        <div className="relative z-50 mt-6">
          <AdSpySearchBar
            value={input}
            country={countryInput}
            platform={platform}
            mode={mode}
            advertisers={autocompleteAdvertisers}
            autocompleteLoading={autocompleteLoading}
            suggestionsOpen={suggestionOpen}
            selectedPageId={selectedPageId}
            onChange={(value) => {
              setInput(value);
              if (selectedPageId) setSelectedPageId(null);
              setSuggestionOpen(true);
            }}
            onSearch={() => void runSearch()}
            onSelectAdvertiser={handleSelectAdvertiser}
            onSelectQuery={() => handleSelectQuery(input.trim())}
            onFocus={() => setSuggestionOpen(true)}
            onCloseSuggestions={() => setSuggestionOpen(false)}
            onCountryChange={setCountryInput}
          />
        </div>

        <div className="mt-3">
          <AdSpyToolbar
            mode={mode}
            platform={platform}
            filter={filter}
            tracked={tracked}
            refreshing={refreshing}
            disabled={input.trim().length < 2}
            onModeChange={(value) => {
              setMode(value);
              setSelectedPageId(null);
            }}
            onFilterChange={setFilter}
            onRefresh={() => void refreshAndPoll(job?.id ?? null)}
            onTrack={() => void handleTrack()}
          />
        </div>
      </div>

'@
  $text = $text.Remove($searchStart, $errorStart - $searchStart).Insert($searchStart, $replacement)
}

$text = $text -replace '(\{refreshing && job \? \([\s\S]*?\) : null\}\r?\n\r?\n)      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">[\s\S]*?</div>\r?\n\r?\n      <div className="flex flex-col gap-3 rounded-3xl', '$1      {(loading || refreshing) ? (\r\n        <AdSpyLoadingIntelligence compact={refreshing} loading />\r\n      ) : null}\r\n\r\n      <AdSpyStats summary={{ ...summary, totalAds: summary.totalAds || total }} />\r\n\r\n      <div className="flex flex-col gap-3 rounded-2xl'

$text = $text -replace '<div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">\r?\n          \{visibleAds\.map\(\(ad\) => <CreativeCard key=\{`\$\{ad\.platform\}:\$\{ad\.id\}`\} ad=\{ad\} onOpen=\{\(\) => setSelectedAd\(ad\)\} />\)\}\r?\n        </div>', '<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">`r`n          {visibleAds.map((ad) => (`r`n            <AdSpyCreativeCard key={`${ad.platform}:${ad.id}`} ad={ad} onInspect={() => setSelectedAd(ad)} />`r`n          ))}`r`n        </div>'

$text = $text.Replace('  Activity,\r\n  ArrowUpRight,\r\n  Bookmark,\r\n  Check,\r\n  ChevronLeft,\r\n  ChevronRight,\r\n  Clock3,\r\n  ExternalLink,\r\n  Image as ImageIcon,\r\n  Layers3,\r\n  Loader2,\r\n  Play,\r\n  RefreshCw,\r\n  Search,\r\n  Sparkles,\r\n  UserRound,\r\n  Video,\r\n  X,', '  Activity,\r\n  Bookmark,\r\n  ChevronLeft,\r\n  ChevronRight,\r\n  Loader2,\r\n  Search,\r\n  Sparkles,\r\n  X,')
$text = $text.Replace('  Activity,\n  ArrowUpRight,\n  Bookmark,\n  Check,\n  ChevronLeft,\n  ChevronRight,\n  Clock3,\n  ExternalLink,\n  Image as ImageIcon,\n  Layers3,\n  Loader2,\n  Play,\n  RefreshCw,\n  Search,\n  Sparkles,\n  UserRound,\n  Video,\n  X,', '  Activity,\n  Bookmark,\n  ChevronLeft,\n  ChevronRight,\n  Loader2,\n  Search,\n  Sparkles,\n  X,')

$text = $text -replace 'const ACTIVE_STATUSES', 'const ACTIVE_STATUSES'

Set-Content -LiteralPath $section -Value $text -NoNewline -Encoding UTF8
Write-Host 'Updated components/dashboard/adspy/AdSpySection.tsx'

$green = Get-ChildItem -Path (Join-Path $repo 'components/dashboard/adspy') -Recurse -File -ErrorAction SilentlyContinue |
  Select-String -Pattern 'emerald|teal|#0d9488|#0f766e|#14b8a6|#16a34a|#059669' -CaseSensitive:$false
if ($green) {
  Write-Warning 'Green/teal references still exist in AdSpy files:'
  $green | ForEach-Object { Write-Host "$($_.Path):$($_.LineNumber) $($_.Line.Trim())" }
}

Write-Host 'Framework integration applied.'
Write-Host 'Next: npm run build'
