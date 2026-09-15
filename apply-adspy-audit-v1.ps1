
$ErrorActionPreference = "Stop"

$Root = "F:\D2C"
Set-Location $Root

function Backup-Once([string]$Path) {
    if (Test-Path $Path) {
        $backup = "$Path.bak-adspy-audit-v1"
        if (-not (Test-Path $backup)) {
            Copy-Item $Path $backup
            Write-Host "Backup: $backup"
        }
    }
}

function Write-Utf8([string]$Path, [string]$Content) {
    Set-Content -Path $Path -Value $Content -Encoding UTF8
}

# ============================================================
# P0/P1: STATUS ENDPOINT
# - use verified JWT claims instead of getUser() network hop
# - detect stale jobs during an existing poll loop
# - return stale=true so the client re-enters /refresh and gets
#   a fresh queue dispatch automatically
# ============================================================

$statusPath = Join-Path $Root "app\api\ad-intelligence\search\status\[jobId]\route.ts"
Backup-Once $statusPath

$statusContent = @'
import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_AFTER_MS = 3 * 60_000;

const ACTIVE_STATUSES = new Set([
  "queued",
  "scraping",
  "normalizing",
  "enriching",
  "finalizing",
]);

function isStale(updatedAt?: string | null): boolean {
  if (!updatedAt) return true;
  const updated = new Date(updatedAt).getTime();
  return !Number.isFinite(updated) || Date.now() - updated > STALE_AFTER_MS;
}

function mapJob(row: any) {
  return {
    id: row.id,
    collectionKey: row.collection_key,
    query: row.query,
    country: row.country,
    platform: row.platform,
    mode: row.mode,
    status: row.status,
    stage: row.stage,
    discoveredAds: Number(row.discovered_ads ?? 0),
    normalizedAds: Number(row.normalized_ads ?? 0),
    persistedAds: Number(row.persisted_ads ?? 0),
    errorMessage: row.error_message ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    lastRequestedAt: row.last_requested_at ?? null,
    updatedAt: row.updated_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ jobId: string }>;
  },
) {
  try {
    const auth = await createServerAuthClient();

    // Verified JWT claims are preferred for this high-frequency read path.
    const { data: claimsData, error: claimsError } =
      await auth.auth.getClaims();

    const userId =
      claimsData?.claims?.sub ??
      null;

    if (claimsError || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          message: "You must be signed in to check collection status.",
        },
        { status: 401 },
      );
    }

    const { jobId } = await context.params;
    const normalizedJobId = jobId?.trim();

    if (!normalizedJobId) {
      return NextResponse.json(
        { success: false, error: "Missing jobId." },
        { status: 400 },
      );
    }

    const client = createGlobalServiceClient();

    const { data, error } = await client.rpc("adspy_get_collection_job", {
      p_job_id: normalizedJobId,
      p_user_id: userId,
    });

    if (error) {
      console.error("[AdSpy Status] RPC failed:", error);

      return NextResponse.json(
        {
          success: false,
          error: "Collection status lookup failed.",
          message: error.message,
          retryable: true,
        },
        { status: 500 },
      );
    }

    const row = Array.isArray(data) ? data[0] ?? null : data ?? null;

    if (!row) {
      return NextResponse.json(
        { success: false, error: "Collection job not found." },
        { status: 404 },
      );
    }

    let stale = false;

    if (
      ACTIVE_STATUSES.has(String(row.status ?? "")) &&
      isStale(row.updated_at)
    ) {
      stale = true;

      const staleMessage =
        "Collection became stale and will be restarted automatically.";

      const { data: marked } = await client
        .from("ad_intelligence_collection_jobs")
        .update({
          status: "failed",
          stage: "failed",
          error_message: staleMessage,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", normalizedJobId)
        .eq("user_id", userId)
        .in("status", [...ACTIVE_STATUSES])
        .select(
          [
            "id",
            "collection_key",
            "query",
            "country",
            "platform",
            "mode",
            "status",
            "stage",
            "discovered_ads",
            "normalized_ads",
            "persisted_ads",
            "error_message",
            "started_at",
            "completed_at",
            "last_requested_at",
            "updated_at",
            "created_at",
          ].join(","),
        )
        .maybeSingle();

      if (marked) {
        return NextResponse.json({
          success: true,
          stale: true,
          job: mapJob(marked),
        });
      }
    }

    return NextResponse.json({
      success: true,
      stale,
      job: mapJob(row),
    });
  } catch (error) {
    console.error("[AdSpy Status] Unexpected error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to load collection status.",
        message:
          error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      },
      { status: 500 },
    );
  }
}
'@

Write-Utf8 $statusPath $statusContent
Write-Host "Updated status endpoint."

# ============================================================
# P1: CLIENT POLLER
# When status reports stale=true, call /refresh immediately.
# This prevents the open tab from polling a dead job for 10 minutes.
# ============================================================

$sectionPath = Join-Path $Root "components\dashboard\adspy\AdSpySection.tsx"
Backup-Once $sectionPath
$section = Get-Content -Raw -Encoding UTF8 $sectionPath

$oldStatusType = 'const data = await response.json() as { success: boolean; job?: Job; error?: string };'
$newStatusType = 'const data = await response.json() as { success: boolean; stale?: boolean; job?: Job; error?: string };'

if ($section -notmatch [regex]::Escape($newStatusType)) {
    $section = $section.Replace($oldStatusType, $newStatusType)
}

$oldFailedBlock = @'
        if (current.status === "complete") {
          setRefreshing(false);
          await fetchSearch(1, true, q, overridePageId ?? selectedPageId);
          return;
        }
        if (current.status === "failed") throw new Error(current.errorMessage || "Collection failed.");
        delay = Math.min(3200, Math.max(700, Math.round(delay * 1.45)));
'@

$newFailedBlock = @'
        if (current.status === "complete") {
          setRefreshing(false);
          await fetchSearch(1, true, q, overridePageId ?? selectedPageId);
          return;
        }

        if (data.stale) {
          const restartUrl = new URL("/api/ad-intelligence/refresh", window.location.origin);
          restartUrl.searchParams.set("q", q);
          restartUrl.searchParams.set(
            "country",
            countryInput.trim().toUpperCase() || "IN",
          );
          restartUrl.searchParams.set("platform", platform);
          restartUrl.searchParams.set("mode", mode);

          if (
            refreshPageId &&
            platform === "meta" &&
            mode === "advertiser"
          ) {
            restartUrl.searchParams.set("pageId", refreshPageId);
          }

          const restartResponse = await fetch(restartUrl, {
            method: "POST",
            cache: "no-store",
          });

          const restartData = (await restartResponse.json()) as {
            success: boolean;
            job?: Job;
            error?: string;
          };

          if (!restartResponse.ok || !restartData.success || !restartData.job) {
            throw new Error(
              restartData.error || "Could not restart stale collection.",
            );
          }

          jobId = restartData.job.id;
          setJob(restartData.job);
          lastPolledPersistedRef.current = -1;
          delay = 450;
          continue;
        }

        if (current.status === "failed") {
          throw new Error(
            current.errorMessage || "Collection failed.",
          );
        }

        delay = Math.min(3200, Math.max(700, Math.round(delay * 1.45)));
'@

if (-not $section.Contains($oldFailedBlock)) {
    throw "Could not find the expected refreshAndPoll status block in AdSpySection.tsx."
}

$section = $section.Replace($oldFailedBlock, $newFailedBlock)
Write-Utf8 $sectionPath $section
Write-Host "Updated open-tab stale-job recovery."

# ============================================================
# P2: SPLIT QUICK + DEEP
# One queue execution handles one phase only.
# Quick schedules deep separately; no 300s quick+deep stack.
# ============================================================

$jobPath = Join-Path $Root "lib\ad-intelligence\jobs\collect-ad-intelligence.ts"
Backup-Once $jobPath
$job = Get-Content -Raw -Encoding UTF8 $jobPath

if ($job -notmatch 'from "@vercel/queue"') {
    $job = $job.Replace(
        'import { collectMetaAdsInBatches } from "@/lib/ad-intelligence/providers/deep-meta";',
        'import { collectMetaAdsInBatches } from "@/lib/ad-intelligence/providers/deep-meta";' + "`r`n" +
        'import { send } from "@vercel/queue";'
    )
}

$oldState = @'
  const state: State = {
    discoveredAds: 0,
    normalizedAds: 0,
    persistedAds: 0,
  };
'@

$newState = @'
  const state: State = {
    discoveredAds:
      initialDepth === "deep"
        ? Number(job.discoveredAds ?? 0)
        : 0,
    normalizedAds:
      initialDepth === "deep"
        ? Number(job.normalizedAds ?? 0)
        : 0,
    persistedAds:
      initialDepth === "deep"
        ? Number(job.persistedAds ?? 0)
        : 0,
  };
'@

if (-not $job.Contains($oldState)) {
    throw "Could not find State initialization in collect-ad-intelligence.ts."
}
$job = $job.Replace($oldState, $newState)

$oldStart = @'
    await updateCollectionJob(data.jobId, {
      status: "scraping",
      stage: "scraping",
      startedAt: new Date().toISOString(),
      errorMessage: null,
      discoveredAds: 0,
      normalizedAds: 0,
      persistedAds: 0,
    });
'@

$newStart = @'
    await updateCollectionJob(data.jobId, {
      status: "scraping",
      stage: initialDepth === "deep" ? "enriching" : "scraping",
      startedAt:
        initialDepth === "deep"
          ? job.startedAt ?? new Date().toISOString()
          : new Date().toISOString(),
      errorMessage: null,
      discoveredAds: state.discoveredAds,
      normalizedAds: state.normalizedAds,
      persistedAds: state.persistedAds,
    });
'@

if (-not $job.Contains($oldStart)) {
    throw "Could not find initial updateCollectionJob block."
}
$job = $job.Replace($oldStart, $newStart)

$oldMetaPhase = @'
    if (data.platform === "meta") {
      const streamInput: {
        query: string;
        country: string;
        platform: AdPlatform;
        mode: AdSearchMode;
        collectionDepth: CollectionDepth;
        advertiserPageId: string | null;
      } = {
            query: data.query,
            country: data.country,
            platform: data.platform,
            mode: data.mode,
            collectionDepth: initialDepth,
            advertiserPageId: data.advertiserPageId ?? null,
          };

      await collectMetaAdsInBatches(streamInput, async (batch) => {
        await persist(initialDepth, batch);
      });

      if (initialDepth === "quick") {
        await updateCollectionJob(data.jobId, {
          status: "scraping",
          stage: "scraping",
          discoveredAds: state.discoveredAds,
          normalizedAds: state.normalizedAds,
          persistedAds: state.persistedAds,
        });

        await collectMetaAdsInBatches(
          { ...streamInput, collectionDepth: "deep" },
          async (batch) => {
            await persist("deep", batch);
          },
        );
      }
    } else {
'@

$newMetaPhase = @'
    if (data.platform === "meta") {
      const streamInput: {
        query: string;
        country: string;
        platform: AdPlatform;
        mode: AdSearchMode;
        collectionDepth: CollectionDepth;
        advertiserPageId: string | null;
      } = {
        query: data.query,
        country: data.country,
        platform: data.platform,
        mode: data.mode,
        collectionDepth: initialDepth,
        advertiserPageId: data.advertiserPageId ?? null,
      };

      await collectMetaAdsInBatches(streamInput, async (batch) => {
        await persist(initialDepth, batch);
      });

      if (initialDepth === "quick") {
        const deepPayload: CollectionEvent = {
          ...data,
          collectionDepth: "deep",
        };

        await updateCollectionJob(data.jobId, {
          status: "enriching",
          stage: "enriching",
          discoveredAds: state.discoveredAds,
          normalizedAds: state.normalizedAds,
          persistedAds: state.persistedAds,
        });

        const deepIdempotencyKey =
          `${data.collectionKey}:deep:${data.jobId}`;

        if (process.env.VERCEL) {
          await send("adspy-collection", deepPayload, {
            idempotencyKey: deepIdempotencyKey,
            retentionSeconds: 24 * 60 * 60,
          });
        } else {
          // Local dev has no queue consumer, so start the deep phase as a
          // separate asynchronous invocation and return the quick phase now.
          void collectAdIntelligence(deepPayload).catch((error) => {
            console.error(
              "[AdIntelligenceJob] local deep phase failed",
              error,
            );
          });
        }

        return {
          jobId: data.jobId,
          ...state,
        };
      }
    } else {
'@

if (-not $job.Contains($oldMetaPhase)) {
    throw "Could not find quick+deep Meta phase block."
}
$job = $job.Replace($oldMetaPhase, $newMetaPhase)

Write-Utf8 $jobPath $job
Write-Host "Split quick and deep collection into separate phases."

# ============================================================
# P3: remove known dead code introduced by the old iterations.
# ============================================================

$dead = @(
  "lib\ad-intelligence\live\meta-searchapi.ts",
  "components\dashboard\adspy\hooks\useAdSpyCollection.ts"
)

foreach ($rel in $dead) {
    $path = Join-Path $Root $rel
    if (Test-Path $path) {
        Remove-Item -Force $path
        Write-Host "Removed dead file: $rel"
    }
}

# Keep the legacy root scratch files out of the runtime but do not delete
# unknown user files automatically.

Write-Host ""
Write-Host "============================================================"
Write-Host "AdSpy backend audit patch complete."
Write-Host "Next:"
Write-Host "  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue"
Write-Host "  npm run build"
Write-Host "Then:"
Write-Host "  npm run dev"
Write-Host "============================================================"
