#!/usr/bin/env node

/**
 * Zooptrack AdSpy benchmark harness.
 *
 * Uses the real authenticated /api/ad-intelligence/refresh + status APIs.
 * Set:
 *   ADSPY_BASE_URL=http://localhost:3000
 *   ADSPY_COOKIE="your browser Cookie header"
 *
 * Optional:
 *   ADSPY_QUERY="mamaearth"
 *   ADSPY_COUNTRY=IN
 *   ADSPY_PLATFORM=meta
 *   ADSPY_MODE=advertiser
 *   ADSPY_PAGE_ID=619181354927737
 *   ADSPY_RUNS=3
 *   ADSPY_TIMEOUT_MS=600000
 *
 * Example:
 *   $env:ADSPY_COOKIE="sb-...=...; other=..."
 *   node scripts/benchmark-adspy.mjs
 */

const BASE_URL = (process.env.ADSPY_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const COOKIE = process.env.ADSPY_COOKIE || "";
const QUERY = process.env.ADSPY_QUERY || "mamaearth";
const COUNTRY = (process.env.ADSPY_COUNTRY || "IN").toUpperCase();
const PLATFORM = process.env.ADSPY_PLATFORM || "meta";
const MODE = process.env.ADSPY_MODE || "advertiser";
const PAGE_ID = process.env.ADSPY_PAGE_ID || "";
const RUNS = Math.max(1, Number(process.env.ADSPY_RUNS || 1));
const TIMEOUT_MS = Math.max(30_000, Number(process.env.ADSPY_TIMEOUT_MS || 600_000));
const POLL_MS = 1_000;

const terminalStatuses = new Set(["complete", "exhausted", "failed", "stale"]);

function now() {
  return performance.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headers() {
  const value = {
    Accept: "application/json",
  };

  if (COOKIE) value.Cookie = COOKIE;
  return value;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {}),
    },
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Keep empty object for diagnostics below.
  }

  return { response, data };
}

async function startRun(runIndex) {
  const url = new URL(`${BASE_URL}/api/ad-intelligence/refresh`);
  url.searchParams.set("q", QUERY);
  url.searchParams.set("country", COUNTRY);
  url.searchParams.set("platform", PLATFORM);
  url.searchParams.set("mode", MODE);

  if (PAGE_ID && PLATFORM === "meta" && MODE === "advertiser") {
    url.searchParams.set("pageId", PAGE_ID);
  }

  const startedAt = now();
  const { response, data } = await fetchJson(url, { method: "POST" });

  if (!response.ok || !data.success || !data.job?.id) {
    throw new Error(
      `run ${runIndex}: refresh failed (${response.status}) ${data.error || JSON.stringify(data)}`
    );
  }

  const jobId = data.job.id;
  let firstProgressMs = null;
  let terminal = null;
  let lastJob = data.job;
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);

    const statusUrl = `${BASE_URL}/api/ad-intelligence/search/status/${encodeURIComponent(jobId)}`;
    const { response: statusResponse, data: statusData } = await fetchJson(statusUrl);

    if (!statusResponse.ok || !statusData.success || !statusData.job) {
      throw new Error(
        `run ${runIndex}: status failed (${statusResponse.status}) ${statusData.error || JSON.stringify(statusData)}`
      );
    }

    lastJob = statusData.job;

    const discovered = Number(lastJob.discoveredAds || 0);
    const normalized = Number(lastJob.normalizedAds || 0);
    const persisted = Number(lastJob.persistedAds || 0);

    if (
      firstProgressMs === null &&
      (discovered > 0 || normalized > 0 || persisted > 0)
    ) {
      firstProgressMs = now() - startedAt;
    }

    if (terminalStatuses.has(lastJob.status)) {
      terminal = now() - startedAt;
      break;
    }
  }

  if (terminal === null) {
    throw new Error(`run ${runIndex}: timeout after ${TIMEOUT_MS}ms`);
  }

  return {
    run: runIndex,
    durationMs: Math.round(terminal),
    firstProgressMs: firstProgressMs === null ? null : Math.round(firstProgressMs),
    status: lastJob.status,
    stage: lastJob.stage || null,
    discovered: Number(lastJob.discoveredAds || 0),
    normalized: Number(lastJob.normalizedAds || 0),
    persisted: Number(lastJob.persistedAds || 0),
    error: lastJob.errorMessage || null,
    jobId,
  };
}

function printResult(result) {
  console.log(
    [
      `#${result.run}`,
      `status=${result.status}`,
      `stage=${result.stage ?? "-"}`,
      `duration=${result.durationMs}ms`,
      `firstProgress=${result.firstProgressMs ?? "-"}ms`,
      `discovered=${result.discovered}`,
      `normalized=${result.normalized}`,
      `persisted=${result.persisted}`,
      result.error ? `error=${result.error}` : "",
    ]
      .filter(Boolean)
      .join(" | ")
  );
}

async function main() {
  console.log("=== ZOOPTRACK ADSPY BENCHMARK ===");
  console.log(`base=${BASE_URL}`);
  console.log(`query=${QUERY}`);
  console.log(`country=${COUNTRY}`);
  console.log(`platform=${PLATFORM}`);
  console.log(`mode=${MODE}`);
  console.log(`pageId=${PAGE_ID || "-"}`);
  console.log(`runs=${RUNS}`);
  console.log(`timeout=${TIMEOUT_MS}ms`);
  console.log(`authenticated_cookie=${COOKIE ? "yes" : "no"}`);
  console.log("");

  if (!COOKIE) {
    console.warn("WARNING: no ADSPY_COOKIE set. The API normally requires an authenticated Supabase session.");
    console.warn("The benchmark will likely return 401 until an authenticated Cookie header is provided.");
    console.log("");
  }

  const results = [];

  for (let run = 1; run <= RUNS; run += 1) {
    try {
      const result = await startRun(run);
      results.push(result);
      printResult(result);
    } catch (error) {
      const result = {
        run,
        status: "benchmark-error",
        stage: null,
        durationMs: null,
        firstProgressMs: null,
        discovered: 0,
        normalized: 0,
        persisted: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      results.push(result);
      printResult(result);
    }

    if (run < RUNS) {
      // The production refresh endpoint deliberately rate-limits/avoids re-running
      // the same collection key for 10 minutes. Change ADSPY_QUERY or wait before
      // repeating the same query. We still print every run to make that behavior explicit.
      console.log("Waiting 2s before next run...");
      await sleep(2_000);
    }
  }

  const successful = results.filter((r) => r.durationMs != null);
  const completed = successful.filter((r) => terminalStatuses.has(r.status));
  const persisted = successful.filter((r) => r.persisted > 0);

  console.log("");
  console.log("=== SUMMARY ===");

  if (successful.length) {
    const durations = successful.map((r) => r.durationMs);
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const min = Math.min(...durations);
    const max = Math.max(...durations);

    const discovered = successful.reduce((a, r) => a + r.discovered, 0);
    const normalized = successful.reduce((a, r) => a + r.normalized, 0);
    const saved = successful.reduce((a, r) => a + r.persisted, 0);

    console.log(`completedRuns=${completed.length}/${successful.length}`);
    console.log(`durationAvgMs=${avg}`);
    console.log(`durationMinMs=${min}`);
    console.log(`durationMaxMs=${max}`);
    console.log(`totalDiscovered=${discovered}`);
    console.log(`totalNormalized=${normalized}`);
    console.log(`totalPersisted=${saved}`);
    console.log(`normalizationRate=${discovered ? ((normalized / discovered) * 100).toFixed(2) : "n/a"}%`);
    console.log(`persistenceRate=${normalized ? ((saved / normalized) * 100).toFixed(2) : "n/a"}%`);
    console.log(`overallPersistedPerDiscovered=${discovered ? ((saved / discovered) * 100).toFixed(2) : "n/a"}%`);
  } else {
    console.log("No completed benchmark runs.");
  }

  console.log("");
  console.log("Interpretation:");
  console.log("- A job ending complete/exhausted with persisted=0 is a data-pipeline failure, not a successful scrape.");
  console.log("- Compare duration, discovered, normalized, persisted, and rates across fresh query keys.");
  console.log("- This harness measures your actual authenticated API/job pipeline, not a generic Apify runtime.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

