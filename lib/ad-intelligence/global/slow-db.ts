/**
 * True when a search failed because the database was too slow or unreachable
 * (client abort, statement_timeout, network/gateway failure), as opposed to a
 * real bug. Used to fail soft instead of returning a 500.
 */
export function isSlowDatabaseError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /timeout|timed out|abort|fetch failed|57014|canceling statement|upstream|gateway|econnreset|socket hang up|network/i.test(text);
}

/** True when PostgREST says the RPC does not exist (migration not applied yet). */
export function isMissingFunctionError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return /PGRST202|could not find the function/i.test(`${error.code ?? ""} ${error.message ?? ""}`);
}
