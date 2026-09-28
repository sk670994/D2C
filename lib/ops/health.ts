/**
 * Is the collection pipeline healthy? Pure, tested; the ops-health cron feeds
 * it numbers from adspy_ops_status + decodes and emails the founder on issues.
 */

export type OpsSnapshot = {
  now: number;
  lastWorkerHeartbeat: string | null;
  liveWorkers: number;
  waitingRequests: number;
  oldestWaitingSec: number | null;
  failed24h: number;
  completed24h: number;
  decodesDone24h: number;
  decodesFailed24h: number;
  geminiConfigured: boolean;
  /** Collection runs on Vercel (SearchApi); no PC/VPS worker is expected. */
  serverlessCollector?: boolean;
};

export type OpsIssue = { key: string; severity: "critical" | "warning"; title: string; detail: string; fix: string };

const MIN = 60_000;

export function evaluateOps(s: OpsSnapshot): OpsIssue[] {
  const issues: OpsIssue[] = [];
  const beat = s.lastWorkerHeartbeat ? Date.parse(s.lastWorkerHeartbeat) : NaN;
  const silentMin = Number.isFinite(beat) ? Math.round((s.now - beat) / MIN) : null;

  if (!s.serverlessCollector && s.liveWorkers === 0 && (silentMin === null || silentMin >= 15)) {
    issues.push({
      key: "worker_down",
      severity: s.waitingRequests > 0 ? "critical" : "warning",
      title: "Collector is offline",
      detail: silentMin === null ? "No worker has ever reported in." : `Last heartbeat ${silentMin} min ago. ${s.waitingRequests} request(s) waiting.`,
      fix: "Start the worker (PC: worker\\start-worker.ps1, or the cloud server: docker compose up -d).",
    });
  }
  if (s.waitingRequests > 0 && (s.oldestWaitingSec ?? 0) >= 45 * 60) {
    issues.push({
      key: "queue_stuck",
      severity: "critical",
      title: "Collection queue is stuck",
      detail: `${s.waitingRequests} request(s) waiting; oldest ${Math.round((s.oldestWaitingSec ?? 0) / 60)} min.`,
      fix: s.serverlessCollector
        ? "Open /api/adspy/drain?wait=1 (with CRON_SECRET) or check the Vercel logs for [AdSpy drain]; check the SearchApi key and quota."
        : "Check the worker log for errors; restart it.",
    });
  }
  const finished = s.failed24h + s.completed24h;
  if (s.failed24h >= 5 && s.failed24h / Math.max(1, finished) >= 0.3) {
    issues.push({
      key: "collection_failing",
      severity: "warning",
      title: "Many collections are failing",
      detail: `${s.failed24h} of ${finished} requests failed in 24 h.`,
      fix: "Meta may be blocking or the page layout changed. Check last_error in adspy_requests.",
    });
  }
  if (s.geminiConfigured && s.decodesFailed24h >= 10 && s.decodesDone24h === 0) {
    issues.push({
      key: "decoding_failing",
      severity: "warning",
      title: "AI decoding is failing",
      detail: `${s.decodesFailed24h} failed, 0 done in 24 h.`,
      fix: "Check GEMINI_API_KEY (no quotes) and the model name in worker\\.env and Vercel.",
    });
  }
  return issues;
}

/** Re-send the same alert only after this long. */
export const ALERT_REPEAT_HOURS = 3;

export function shouldSendAlert(lastSentAt: string | null | undefined, now: number): boolean {
  const t = lastSentAt ? Date.parse(lastSentAt) : NaN;
  return !Number.isFinite(t) || now - t >= ALERT_REPEAT_HOURS * 3_600_000;
}
