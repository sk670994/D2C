/**
 * Delivery bookkeeping for scheduled rival reports (alert_deliveries rows).
 *
 *   <key>            claimed or sent for this period (claimed before sending)
 *   <key>:skip       user skipped for this period (no email / no active plan)
 *   <key>:fail:<n>   n-th failed send; after MAX_REPORT_SEND_ATTEMPTS we give up
 */
export const MAX_REPORT_SEND_ATTEMPTS = 3;

export function skipKey(deliveryKey: string): string {
  return `${deliveryKey}:skip`;
}

export function failKey(deliveryKey: string, attempt: number): string {
  return `${deliveryKey}:fail:${attempt}`;
}

export function failureCount(keys: Iterable<string>, deliveryKey: string): number {
  const prefix = `${deliveryKey}:fail:`;
  let count = 0;
  for (const key of keys) if (key.startsWith(prefix)) count += 1;
  return count;
}

/** True when nothing more should be done for this user in this period. */
export function reportSettled(keys: Iterable<string>, deliveryKey: string): boolean {
  const list = Array.from(keys);
  if (list.includes(deliveryKey) || list.includes(skipKey(deliveryKey))) return true;
  return failureCount(list, deliveryKey) >= MAX_REPORT_SEND_ATTEMPTS;
}
