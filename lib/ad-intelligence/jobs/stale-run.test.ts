import { describe, expect, it } from "vitest";

import { RUN_STALE_AFTER_MS, RUNNING_RUN_HARD_STALE_MS, WAITING_RUN_STALE_AFTER_MS, isRunStale } from "./stale-run";

const min = 60_000;

describe("isRunStale", () => {
  it("keeps a running run with a fresh heartbeat", () => {
    expect(isRunStale({ status: "running", heartbeatAgeMs: 1 * min, leaseLive: false })).toBe(false);
  });

  it("keeps a running run with a missed heartbeat while its request lease is live", () => {
    expect(isRunStale({ status: "running", heartbeatAgeMs: RUN_STALE_AFTER_MS + min, leaseLive: true })).toBe(false);
  });

  it("fails a running run with a missed heartbeat and no live lease", () => {
    expect(isRunStale({ status: "running", heartbeatAgeMs: RUN_STALE_AFTER_MS + min, leaseLive: false })).toBe(true);
  });

  it("uses the 20-minute threshold when the lease cannot be checked or is held", () => {
    expect(isRunStale({ status: "running", heartbeatAgeMs: 10 * min, leaseLive: null })).toBe(false);
    expect(isRunStale({ status: "running", heartbeatAgeMs: RUNNING_RUN_HARD_STALE_MS, leaseLive: null })).toBe(true);
    expect(isRunStale({ status: "running", heartbeatAgeMs: RUNNING_RUN_HARD_STALE_MS, leaseLive: true })).toBe(true);
  });

  it("keeps the waiting-run threshold for queued runs", () => {
    expect(isRunStale({ status: "queued", heartbeatAgeMs: WAITING_RUN_STALE_AFTER_MS - 1, leaseLive: false })).toBe(false);
    expect(isRunStale({ status: "queued", heartbeatAgeMs: WAITING_RUN_STALE_AFTER_MS, leaseLive: false })).toBe(true);
  });
});
