import "server-only";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { pickExactPage } from "./pick-page";

type Row = { page_id?: string | number | null; label?: string | null; verification?: string | null };

/**
 * Brand name -> one Meta page we already know, before any collection runs.
 * Normal index search first, then the punctuation-free fallback ("ptal" ->
 * P-TAL). Only an unambiguous match (pickExactPage) is returned; anything
 * else stays a name search. Never throws.
 */
export async function resolveIndexedPage(name: string, country: string): Promise<{ pageId: string; label: string } | null> {
  const q = String(name ?? "").trim();
  if (q.length < 2) return null;
  try {
    const client = createGlobalServiceClient();
    const args = { p_query: q, p_platform: "meta", p_country: country || "IN", p_limit: 12 };
    let rows: Row[] = [];
    const first = await client.rpc("adspy_autocomplete_advertisers", args);
    if (!first.error) rows = (first.data ?? []) as Row[];
    let pick = pickExactPage(q, rows.map((r) => ({ pageId: r.page_id, label: r.label, verification: r.verification })));
    if (!pick && q.replace(/[^\p{L}\p{N}]/gu, "").length >= 4) {
      const compact = await client.rpc("adspy_autocomplete_compact", args);
      if (!compact.error) {
        rows = [...((compact.data ?? []) as Row[]), ...rows];
        pick = pickExactPage(q, rows.map((r) => ({ pageId: r.page_id, label: r.label, verification: r.verification })));
      }
    }
    return pick ? { pageId: String(pick.pageId).trim(), label: String(pick.label ?? q) } : null;
  } catch {
    return null;
  }
}
