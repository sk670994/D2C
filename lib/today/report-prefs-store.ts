import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

import { DEFAULT_REPORT_PREFS, normalizePrefs, type ReportPrefs } from "./report-schedule";


/** Prefs for many users in one query; users without a row get the defaults. */
export async function loadReportPrefs(userIds: string[]): Promise<Map<string, ReportPrefs>> {
  const out = new Map<string, ReportPrefs>();
  for (const id of userIds) out.set(id, DEFAULT_REPORT_PREFS);
  const client = createGlobalServiceClient();
  for (let i = 0; i < userIds.length; i += 500) {
    const { data, error } = await client.from("report_preferences").select("*").in("user_id", userIds.slice(i, i + 500));
    if (error) break; // table missing (migration not run yet) -> defaults for everyone
    for (const row of (data ?? []) as Array<Record<string, unknown>>) out.set(String(row.user_id), normalizePrefs(row));
  }
  return out;
}

export async function getReportPrefs(userId: string): Promise<ReportPrefs> {
  return (await loadReportPrefs([userId])).get(userId) ?? DEFAULT_REPORT_PREFS;
}

export async function saveReportPrefs(userId: string, input: unknown): Promise<ReportPrefs> {
  const prefs = normalizePrefs(input);
  const client = createGlobalServiceClient();
  const row = { user_id: userId, ...prefs, updated_at: new Date().toISOString() };
  let { error } = await client.from("report_preferences").upsert(row, { onConflict: "user_id" });
  // Before the "minute" column exists (migration 20261007010000), save without it.
  if (error && /minute/i.test(error.message)) {
    const { minute: _minute, ...withoutMinute } = row;
    ({ error } = await client.from("report_preferences").upsert(withoutMinute, { onConflict: "user_id" }));
  }
  if (error) throw new Error(`Could not save report settings: ${error.message}`);
  return prefs;
}
