/**
 * Per-user cron work (reports, alerts) that never outgrows one function run.
 *
 * Users are processed in a stable order, a few at a time, until the time
 * budget is spent; the caller continues from `nextOffset` in a new run.
 * Each step must be idempotent (callers record deliveries), so a repeated
 * run is harmless.
 */
export async function runUserBatch(input: {
  userIds: string[];
  offset: number;
  deadlineAt: number;
  concurrency?: number;
  work: (userId: string) => Promise<void>;
}): Promise<{ nextOffset: number | null; processed: number }> {
  const ids = [...input.userIds].sort();
  const concurrency = Math.max(1, input.concurrency ?? 4);
  let i = Math.max(0, input.offset);
  let processed = 0;
  while (i < ids.length && Date.now() < input.deadlineAt) {
    const slice = ids.slice(i, i + concurrency);
    await Promise.allSettled(slice.map((id) => input.work(id)));
    i += slice.length;
    processed += slice.length;
  }
  return { nextOffset: i < ids.length ? i : null, processed };
}
