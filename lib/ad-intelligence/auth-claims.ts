import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Prefer locally verified JWT claims on hot status paths. The getUser fallback
 * keeps the app compatible with environments/configurations where getClaims
 * cannot verify the token locally.
 */
export async function getVerifiedUserId(auth: SupabaseClient): Promise<string | null> {
  try {
    const claimsResult = await auth.auth.getClaims();
    const sub = (claimsResult.data?.claims as { sub?: unknown } | null)?.sub;
    if (typeof sub === "string" && sub.length > 0) return sub;
  } catch {
    // Fall through to authoritative session lookup.
  }

  try {
    const { data, error } = await auth.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
