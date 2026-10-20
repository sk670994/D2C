import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type VerifiedUser = {
  id: string;
  email: string | undefined;
};

/**
 * Cheap, verified identity for server pages and routes that only need to gate
 * or redirect. getClaims() verifies the JWT locally (asymmetric signing keys)
 * instead of a network round trip to Supabase Auth; when it cannot (symmetric
 * keys, network failure, malformed token) we fall back to getUser().
 */
export async function getVerifiedUserFrom(
  supabase: SupabaseClient,
): Promise<VerifiedUser | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as { sub?: unknown; email?: unknown } | undefined;
    if (!error && claims && typeof claims.sub === "string" && claims.sub.length > 0) {
      return {
        id: claims.sub,
        email: typeof claims.email === "string" && claims.email ? claims.email : undefined,
      };
    }
  } catch {
    // Fall through to the authoritative lookup.
  }

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? undefined };
  } catch {
    return null;
  }
}

export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  return getVerifiedUserFrom(await createClient());
}
