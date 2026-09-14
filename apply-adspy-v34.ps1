$ErrorActionPreference = "Stop"

$Root = "F:\D2C"
Set-Location $Root

function Backup-Once([string]$Path) {
    if (Test-Path $Path) {
        $backup = "$Path.bak-adspy-v34"
        if (-not (Test-Path $backup)) {
            Copy-Item $Path $backup
            Write-Host "Backup: $backup"
        }
    }
}

# ------------------------------------------------------------
# 1) Fix the runtime compile error:
#    collect-ad-intelligence imports collectMetaAdsInBatches.
#    The provider on the user's current tree does not export it.
# ------------------------------------------------------------
$deepPath = Join-Path $Root "lib\ad-intelligence\providers\deep-meta.ts"
Backup-Once $deepPath
$deep = Get-Content -Raw -Encoding UTF8 $deepPath

if ($deep -notmatch "export\s+async\s+function\s+collectMetaAdsInBatches") {
    $marker = "export const deepMetaProvider: AdProvider = {"

    if ($deep -notmatch [regex]::Escape($marker)) {
        throw "Could not find '$marker' in deep-meta.ts."
    }

    $helper = @'
export async function collectMetaAdsInBatches(
  input: AdSearchInput,
  onBatch: (ads: CompetitorAd[]) => Promise<void> | void,
): Promise<number> {
  const result = await deepMetaProvider.search({
    ...input,
    collectionDepth: input.collectionDepth ?? "deep",
  });

  const ads = result.ads ?? [];

  for (let offset = 0; offset < ads.length; offset += 25) {
    const batch = ads.slice(offset, offset + 25);
    if (batch.length > 0) {
      await onBatch(batch);
    }
  }

  return ads.length;
}

'@

    $deep = $deep.Replace($marker, "$helper$marker")
    Set-Content -Path $deepPath -Value $deep -Encoding UTF8
    Write-Host "Fixed collectMetaAdsInBatches export."
}
else {
    Write-Host "collectMetaAdsInBatches already exists; leaving it unchanged."
}

# ------------------------------------------------------------
# 2) Make Meta suggestions truly Meta-first.
#
#    The previous version failed because it assumed a particular
#    visible <input>. Meta's current public page can expose the
#    search surface differently in headless sessions.
#
#    This replacement:
#      - captures Meta network JSON BEFORE navigation
#      - queries Meta's actual public Ad Library URL directly
#      - extracts advertiser IDs/names from both network + DOM
#      - only falls back to interactive typing if an input actually exists
#      - never queues stale keystrokes behind older requests
# ------------------------------------------------------------
$metaPath = Join-Path $Root "lib\ad-intelligence\global\meta-page-search.ts"
Backup-Once $metaPath
$meta = Get-Content -Raw -Encoding UTF8 $metaPath

$runStart = $meta.IndexOf("async function runInteractiveLookup(")
$runEnd   = $meta.IndexOf("`nasync function lookupMetaPages(", $runStart)

if ($runStart -lt 0 -or $runEnd -lt 0) {
    throw "Could not locate runInteractiveLookup()/lookupMetaPages() in meta-page-search.ts."
}

$newRun = @'
async function runInteractiveLookup(
  session: SuggestionSession,
  query: string,
): Promise<Candidate[]> {
  const page = session.page;
  session.requestCount += 1;
  session.lastUsedAt = Date.now();

  const payloads: unknown[] = [];

  const onResponse = async (response: {
    url(): string;
    headers(): Record<string, string>;
    json(): Promise<unknown>;
  }) => {
    const url = response.url();

    if (
      !url.includes("facebook.com") ||
      !/(graphql|ajax|api|ads\/library)/i.test(url)
    ) {
      return;
    }

    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("json")) return;

    try {
      payloads.push(await response.json());
    } catch {
      // Ignore malformed/non-JSON payloads.
    }
  };

  page.on("response", onResponse);

  try {
    // PRIMARY PATH:
    // Query Meta's public Ad Library URL directly while listening to the
    // responses from the beginning of navigation. This does not depend on
    // Meta's current search-input DOM implementation.
    try {
      const url = new URL(META_LIBRARY_URL);
      url.searchParams.set("active_status", "all");
      url.searchParams.set("ad_type", "all");
      url.searchParams.set("country", session.country);
      url.searchParams.set("is_targeted_country", "false");
      url.searchParams.set("media_type", "all");
      url.searchParams.set("search_type", "keyword_unordered");
      url.searchParams.set("q", query);

      await page.goto(url.toString(), {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT,
      });

      await page.waitForTimeout(650);
    } catch (error) {
      console.warn("[MetaPageSearch] public URL lookup failed", error);
    }

    let network = await extractNetworkCandidates(payloads, query);
    let dom = await extractCandidatesFromDOM(page, query);

    // SECONDARY PATH:
    // If Meta exposed a usable search control, interact with it exactly as
    // the public UI does. This is only used when the URL path did not return
    // enough advertiser entities.
    if (network.length + dom.length < 1) {
      const contexts = [page, ...page.frames()];
      const selectors = [
        'input[placeholder="Search by keyword or advertiser"]:visible',
        'input[aria-label="Search by keyword or advertiser"]:visible',
        'input[type="search"]:visible',
        'input[role="combobox"]:visible',
        'input[aria-label*="search" i]:visible',
        'input[placeholder*="search" i]:visible',
        'input[type="text"]:visible',
        'textarea[aria-label*="search" i]:visible',
        '[contenteditable="true"]:visible',
      ];

      let input: ReturnType<Page["locator"]> | null = null;

      for (const context of contexts) {
        for (const selector of selectors) {
          try {
            const loc = context.locator(selector);
            const count = Math.min(await loc.count(), 6);

            for (let index = 0; index < count; index += 1) {
              const candidate = loc.nth(index);
              if (!(await candidate.isVisible())) continue;

              const box = await candidate.boundingBox().catch(() => null);
              if (!box || box.width < 140 || box.height < 18) continue;

              input = candidate;
              break;
            }
          } catch {
            // Continue.
          }

          if (input) break;
        }

        if (input) break;

        try {
          const textbox = context.getByRole("textbox").first();
          if (await textbox.count() && await textbox.isVisible()) {
            const box = await textbox.boundingBox().catch(() => null);
            if (box && box.width >= 140 && box.height >= 18) {
              input = textbox;
              break;
            }
          }
        } catch {
          // Continue.
        }
      }

      if (input) {
        try {
          await input.click({ timeout: 1_500 });

          try {
            await input.fill("");
          } catch {
            await input.press("ControlOrMeta+A").catch(() => undefined);
            await input.press("Backspace").catch(() => undefined);
          }

          await input.pressSequentially(query, { delay: 4 });
          await page.waitForTimeout(650);

          network = await extractNetworkCandidates(payloads, query);
          dom = await extractCandidatesFromDOM(page, query);
        } catch (error) {
          console.warn("[MetaPageSearch] interactive typing fallback failed", error);
        }
      }
    }

    const merged = new Map<string, Candidate>();

    for (const candidate of [...dom, ...network]) {
      const existing = merged.get(candidate.pageId);

      if (!existing) {
        merged.set(candidate.pageId, candidate);
      } else {
        merged.set(candidate.pageId, {
          ...existing,
          imageUrl: existing.imageUrl ?? candidate.imageUrl,
          category: existing.category ?? candidate.category,
          verification: existing.verification ?? candidate.verification,
          likes: existing.likes ?? candidate.likes,
          igFollowers: existing.igFollowers ?? candidate.igFollowers,
          igUsername: existing.igUsername ?? candidate.igUsername,
          pageAlias: existing.pageAlias ?? candidate.pageAlias,
        });
      }
    }

    return [...merged.values()]
      .map((candidate) => ({
        candidate,
        score: relevanceScore(candidate.name, query),
      }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS)
      .map(({ candidate }) => candidate);
  } finally {
    page.off("response", onResponse);
  }
}
'@

$meta = $meta.Substring(0, $runStart) + $newRun + $meta.Substring($runEnd)

# Replace the serialized busy queue with latest-request behavior.
$lookupStart = $meta.IndexOf("async function lookupMetaPages(")
$searchExportStart = $meta.IndexOf("`nexport async function searchMetaPages(", $lookupStart)

if ($lookupStart -lt 0 -or $searchExportStart -lt 0) {
    throw "Could not locate lookupMetaPages()/searchMetaPages() boundaries."
}

$newLookup = @'
async function lookupMetaPages(
  query: string,
  country: string,
): Promise<Candidate[]> {
  const browserInstance = await getBrowser();
  const session = await getSuggestionSession(browserInstance, country);

  // Never put current typing behind stale keystrokes.
  if (session.busy) return [];

  let release!: () => void;

  session.busy = new Promise<void>((resolve) => {
    release = resolve;
  });

  try {
    return await runInteractiveLookup(session, query);
  } catch (error) {
    console.warn("[MetaPageSearch] lookup failed", error);

    await session.context.close().catch(() => undefined);
    sessions.delete(country);

    return [];
  } finally {
    release();
    session.busy = null;
  }
}
'@

$meta = $meta.Substring(0, $lookupStart) + $newLookup + $meta.Substring($searchExportStart)

# Keep Meta autocomplete bounded.
$meta = $meta -replace 'const OVERALL_TIMEOUT_MS = 4_500;', 'const OVERALL_TIMEOUT_MS = 3_000;'

Set-Content -Path $metaPath -Value $meta -Encoding UTF8
Write-Host "Updated Meta suggestion broker."

# ------------------------------------------------------------
# 3) Force the AdSpy interactive palette to blue/slate.
# ------------------------------------------------------------
$cssPath = Join-Path $Root "components\dashboard\adspy\adspy-v33.css"
if (Test-Path $cssPath) {
    Backup-Once $cssPath

    $css = Get-Content -Raw -Encoding UTF8 $cssPath
    $css += @'

/* v34 authoritative override */
[data-adspy-root] [data-adspy-control="suggestion"],
[data-adspy-root] [data-adspy-control="suggestion"]:hover {
  background: #fff !important;
  background-color: #fff !important;
  background-image: none !important;
  color: #0f172a !important;
  border-color: #e2e8f0 !important;
}

[data-adspy-root] [data-adspy-control="primary"] {
  background: #0f172a !important;
  background-color: #0f172a !important;
  background-image: none !important;
  color: #fff !important;
}

[data-adspy-root] [data-adspy-control="secondary"] {
  background: #fff !important;
  background-color: #fff !important;
  background-image: none !important;
  color: #475569 !important;
  border-color: #e2e8f0 !important;
}
'@

    Set-Content -Path $cssPath -Value $css -Encoding UTF8
    Write-Host "Applied final blue/slate control override."
}

# ------------------------------------------------------------
# 4) Clean stale build cache.
# ------------------------------------------------------------
Remove-Item -Recurse -Force (Join-Path $Root ".next") -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "AdSpy v34 hotfix applied."
Write-Host "Backups end with .bak-adspy-v34"
Write-Host ""
Write-Host "Now run:"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Test:"
Write-Host "  mama"
Write-Host "  mamaearth"
Write-Host "  colga"
Write-Host ""
Write-Host "Expected:"
Write-Host "  - Meta-backed advertiser suggestions"
Write-Host "  - no stale-keystroke queue"
Write-Host "  - no collectMetaAdsInBatches module error"
Write-Host "  - blue/slate suggestion controls"
