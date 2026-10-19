import { describe, expect, it } from "vitest";

import { MAX_REPORT_SEND_ATTEMPTS, failKey, failureCount, reportSettled, skipKey } from "./report-delivery";

const key = "report:d:2026-10-19";

describe("report delivery bookkeeping", () => {
  it("is pending when nothing is recorded", () => {
    expect(reportSettled([], key)).toBe(false);
  });

  it("is settled once claimed/sent or skipped", () => {
    expect(reportSettled([key], key)).toBe(true);
    expect(reportSettled([skipKey(key)], key)).toBe(true);
  });

  it("ignores rows from another period", () => {
    expect(reportSettled(["report:d:2026-10-18", "report:d:2026-10-18:skip"], key)).toBe(false);
  });

  it("retries failed sends until the cap", () => {
    const fails = Array.from({ length: MAX_REPORT_SEND_ATTEMPTS - 1 }, (_, i) => failKey(key, i + 1));
    expect(failureCount(fails, key)).toBe(MAX_REPORT_SEND_ATTEMPTS - 1);
    expect(reportSettled(fails, key)).toBe(false);
    expect(reportSettled([...fails, failKey(key, MAX_REPORT_SEND_ATTEMPTS)], key)).toBe(true);
  });
});
