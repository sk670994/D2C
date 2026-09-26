import { describe, expect, it } from "vitest";

import {
  CircuitBreaker,
  classifyCollectionError,
  idleDelayMs,
  pickRunnable,
  shouldRecycleBrowser,
  type Candidate,
} from "./worker-core";

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: "r1",
    run_id: "run1",
    payload: { jobId: "j1", runId: "run1" },
    attempt: 0,
    max_attempts: 2,
    priority: 100,
    available_at: new Date(0).toISOString(),
    created_at: new Date(0).toISOString(),
    status: "queued",
    ...over,
  };
}

describe("classifyCollectionError", () => {
  it("maps Chromium resource failures (the 2026-09 production errors)", () => {
    expect(classifyCollectionError(new Error("page.goto: net::ERR_INSUFFICIENT_RESOURCES"))).toBe("BROWSER_RESOURCE_ERROR");
    expect(classifyCollectionError(new Error("browserContext.newPage: Target page, context or browser has been closed"))).toBe("BROWSER_RESOURCE_ERROR");
    expect(classifyCollectionError(new Error("FILE_ERROR_NO_SPACE while writing profile"))).toBe("BROWSER_RESOURCE_ERROR");
  });
  it("maps navigation, state and database failures", () => {
    expect(classifyCollectionError(new Error("page.goto: Timeout 30000ms exceeded."))).toBe("SOURCE_NAVIGATION_ERROR");
    expect(classifyCollectionError(new Error("Failed to complete durable AdSpy request: AdSpy request x is not running or no longer exists"))).toBe("STATE_CONFLICT");
    expect(classifyCollectionError(new Error("Failed to claim durable AdSpy request: canceling statement due to statement timeout"))).toBe("DATABASE_ERROR");
    expect(classifyCollectionError(new Error("You're Temporarily Blocked"))).toBe("SOURCE_BLOCKED");
    expect(classifyCollectionError("weird")).toBe("UNKNOWN");
  });
});

describe("pickRunnable", () => {
  it("skips exhausted, future and terminal requests", () => {
    const now = Date.now();
    const list = [
      candidate({ id: "done", status: "completed" }),
      candidate({ id: "exhausted", attempt: 2, max_attempts: 2 }),
      candidate({ id: "later", available_at: new Date(now + 60_000).toISOString() }),
      candidate({ id: "ok", status: "retrying", attempt: 1 }),
    ];
    expect(pickRunnable(list, now)?.id).toBe("ok");
    expect(pickRunnable([], now)).toBeNull();
  });
});

describe("idleDelayMs", () => {
  it("backs off from ~1s to at most ~5s", () => {
    expect(idleDelayMs(1, () => 0.5)).toBe(1000);
    expect(idleDelayMs(3, () => 0.5)).toBe(3000);
    expect(idleDelayMs(50, () => 0.5)).toBe(5000);
    expect(idleDelayMs(50, () => 1)).toBeLessThanOrEqual(5750);
  });
});

describe("shouldRecycleBrowser", () => {
  it("recycles after N jobs or above the RSS limit", () => {
    expect(shouldRecycleBrowser({ jobsSinceRecycle: 3, recycleEvery: 15, rssMb: 400, maxRssMb: 1200 })).toBe(false);
    expect(shouldRecycleBrowser({ jobsSinceRecycle: 15, recycleEvery: 15, rssMb: 400, maxRssMb: 1200 })).toBe(true);
    expect(shouldRecycleBrowser({ jobsSinceRecycle: 1, recycleEvery: 15, rssMb: 1300, maxRssMb: 1200 })).toBe(true);
  });
});

describe("CircuitBreaker", () => {
  it("opens after repeated source failures and lets one probe through later", () => {
    let t = 0;
    const b = new CircuitBreaker({ failureThreshold: 3, openMs: 1000 }, () => t);
    b.recordFailure();
    b.recordFailure();
    expect(b.allow()).toBe(true);
    b.recordFailure();
    expect(b.state()).toBe("open");
    expect(b.allow()).toBe(false);
    t = 1500;
    expect(b.state()).toBe("half_open");
    expect(b.allow()).toBe(true); // the probe
    expect(b.allow()).toBe(false); // only one probe at a time
    b.recordFailure(); // probe failed -> open again
    expect(b.state()).toBe("open");
    t = 3000;
    expect(b.allow()).toBe(true);
    b.recordSuccess();
    expect(b.state()).toBe("closed");
  });
  it("release() frees a probe that ended for a non-source reason", () => {
    let t = 0;
    const b = new CircuitBreaker({ failureThreshold: 1, openMs: 10 }, () => t);
    b.recordFailure();
    t = 20;
    expect(b.allow()).toBe(true);
    expect(b.allow()).toBe(false);
    b.release();
    expect(b.allow()).toBe(true);
  });
});
