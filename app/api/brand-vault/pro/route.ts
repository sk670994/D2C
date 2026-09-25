import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBrandVaultAnalytics, normalizeEconomics } from "@/lib/brand-vault/pro";
import type { BrandVaultPeriod } from "@/lib/brand-vault/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validPeriod = (value: string | null): BrandVaultPeriod =>
  value === "week" || value === "quarter" ? value : "month";

export async function GET(request: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const period = validPeriod(request.nextUrl.searchParams.get("period"));
  const [{ data: vault, error: vaultError }, { data: competitors, error: competitorError }, { data: savedActions, error: actionsError }] = await Promise.all([
    auth.from("brand_vaults").select("brand_name,website_url,tone,audience,do_not_say,hero_product,main_objection,competitor_focus,economics,updated_at").eq("user_id", user.id).maybeSingle(),
    auth.from("brand_vault_competitors").select("id,slot,name,domain,advertiser_page_id,country,platform,created_at,updated_at").eq("user_id", user.id).order("slot", { ascending: true }),
    auth.from("brand_vault_saved_actions").select("id,action_type,reference_key,title,payload,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (vaultError || competitorError || actionsError) return NextResponse.json({ success: false, error: vaultError?.message || competitorError?.message || actionsError?.message }, { status: 500 });

  const mappedCompetitors = (competitors ?? []).map((row) => ({
    id: row.id, slot: Number(row.slot) as 1 | 2 | 3, name: row.name, domain: row.domain,
    advertiserPageId: row.advertiser_page_id, country: row.country, platform: "meta" as const,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  const analytics = await getBrandVaultAnalytics({
    competitors: mappedCompetitors,
    period,
    economics: normalizeEconomics(vault?.economics),
    brandName: vault?.brand_name ?? "",
  });
  return NextResponse.json({ success: true, brandVault: vault ? {
    brandName: vault.brand_name ?? "", websiteUrl: vault.website_url ?? "", tone: vault.tone ?? "", audience: vault.audience ?? "",
    doNotSay: vault.do_not_say ?? "", heroProduct: vault.hero_product ?? "", mainObjection: vault.main_objection ?? "", competitorFocus: vault.competitor_focus ?? "",
    economics: normalizeEconomics(vault.economics), updatedAt: vault.updated_at,
  } : null, competitors: mappedCompetitors, analytics, savedActions: (savedActions ?? []).map((row) => ({ id: row.id, actionType: row.action_type, referenceKey: row.reference_key, title: row.title, payload: row.payload ?? {}, createdAt: row.created_at })) });
}
