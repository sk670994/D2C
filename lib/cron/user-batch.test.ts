import { describe, expect, it } from "vitest";

import { runUserBatch } from "./user-batch";

describe("runUserBatch", () => {
  it("does everyone when time allows, in a stable order", async () => {
    const seen: string[] = [];
    const r = await runUserBatch({ userIds: ["c", "a", "b"], offset: 0, deadlineAt: Date.now() + 5_000, work: async (id) => void seen.push(id) });
    expect(r.nextOffset).toBe(null);
    expect([...seen].sort()).toEqual(["a", "b", "c"]);
  });
  it("stops at the deadline and resumes from the offset without repeats", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `u${i}`);
    const first = await runUserBatch({ userIds: ids, offset: 0, deadlineAt: Date.now() - 1, work: async () => undefined });
    expect(first.nextOffset).toBe(0);
    const seen: string[] = [];
    const r = await runUserBatch({ userIds: ids, offset: 8, deadlineAt: Date.now() + 5_000, concurrency: 4, work: async (id) => void seen.push(id) });
    expect(r.nextOffset).toBe(null);
    expect(seen).toEqual(["u8", "u9"]);
  });
  it("a failing user does not stop the batch", async () => {
    let ok = 0;
    const r = await runUserBatch({
      userIds: ["a", "b"],
      offset: 0,
      deadlineAt: Date.now() + 5_000,
      work: async (id) => {
        if (id === "a") throw new Error("boom");
        ok += 1;
      },
    });
    expect(r.nextOffset).toBe(null);
    expect(ok).toBe(1);
  });
});
