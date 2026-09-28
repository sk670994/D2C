import { describe, expect, it } from "vitest";

import { evaluateOps, shouldSendAlert, type OpsSnapshot } from "./health";

const now = Date.parse("2026-10-01T12:00:00Z");
const base: OpsSnapshot = {
  now,
  lastWorkerHeartbeat: new Date(now - 30_000).toISOString(),
  liveWorkers: 1,
  waitingRequests: 0,
  oldestWaitingSec: null,
  failed24h: 0,
  completed24h: 20,
  decodesDone24h: 50,
  decodesFailed24h: 2,
  geminiConfigured: true,
};

describe("evaluateOps", () => {
  it("is quiet when healthy", () => {
    expect(evaluateOps(base)).toEqual([]);
  });
  it("flags an offline worker, critical when work is waiting", () => {
    const off = evaluateOps({ ...base, liveWorkers: 0, lastWorkerHeartbeat: new Date(now - 40 * 60_000).toISOString(), waitingRequests: 3 });
    expect(off[0].key).toBe("worker_down");
    expect(off[0].severity).toBe("critical");
    expect(evaluateOps({ ...base, liveWorkers: 0, lastWorkerHeartbeat: new Date(now - 5 * 60_000).toISOString() })).toEqual([]);
  });
  it("does not expect a worker when SearchApi collects on Vercel", () => {
    const off = { ...base, liveWorkers: 0, lastWorkerHeartbeat: null, serverlessCollector: true };
    expect(evaluateOps(off)).toEqual([]);
    const stuck = evaluateOps({ ...off, waitingRequests: 2, oldestWaitingSec: 3600 });
    expect(stuck.map((i) => i.key).join(",")).toBe("queue_stuck");
    expect(stuck[0].fix).toMatch(/drain/);
  });
  it("flags a stuck queue and failing collections", () => {
    const keys = evaluateOps({ ...base, waitingRequests: 4, oldestWaitingSec: 3600, failed24h: 9, completed24h: 6 }).map((i) => i.key);
    expect(keys.includes("queue_stuck")).toBe(true);
    expect(keys.includes("collection_failing")).toBe(true);
  });
  it("flags decoding only when nothing succeeds", () => {
    expect(evaluateOps({ ...base, decodesDone24h: 0, decodesFailed24h: 38 }).map((i) => i.key)).toEqual(["decoding_failing"]);
    expect(evaluateOps({ ...base, decodesDone24h: 0, decodesFailed24h: 38, geminiConfigured: false })).toEqual([]);
  });
});

describe("shouldSendAlert", () => {
  it("throttles repeats", () => {
    expect(shouldSendAlert(null, now)).toBe(true);
    expect(shouldSendAlert(new Date(now - 60 * 60_000).toISOString(), now)).toBe(false);
    expect(shouldSendAlert(new Date(now - 4 * 3_600_000).toISOString(), now)).toBe(true);
  });
});
