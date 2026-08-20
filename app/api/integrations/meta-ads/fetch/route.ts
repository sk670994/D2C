import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

interface MetaInsights {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  date_stop: string;
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  purchase_roas?: unknown;
}

const META_GRAPH_VERSION = "v18.0";

function normalizeMetaAccountId(accountId: string) {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}

function getPurchaseRoas(value: unknown) {
  if (Array.isArray(value) && value[0] && typeof value[0] === "object" && "value" in value[0]) {
    const parsed = Number((value[0] as { value?: string }).value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// POST: Fetch and store Meta Ads metrics
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerAuthClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { accountId, datePreset = "last_30d" } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: "Account ID required" }, { status: 400 });
    }

    // Get the access token for this account
    const { data: account, error: accountError } = await supabase
      .from("ad_accounts")
      .select("access_token, token_expiry")
      .eq("user_id", user.id)
      .eq("platform", "meta")
      .eq("account_id", accountId)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let accessToken = account.access_token;

    // Check if token is expired and refresh if needed
    if (account.token_expiry && new Date(account.token_expiry) < new Date()) {
      // Token refresh logic would go here
      // For now, assume token is valid
    }

    const metaAccountId = normalizeMetaAccountId(accountId);

    // Get ad-level insights so customers can see actual ads and spend.
    const insightsResponse = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${metaAccountId}/insights?level=ad&fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,date_start,date_stop,impressions,clicks,spend,ctr,cpc,purchase_roas&date_preset=${datePreset}&access_token=${accessToken}`
    );

    if (!insightsResponse.ok) {
      const errorBody = await insightsResponse.text();
      throw new Error(`Failed to fetch Meta ad insights: ${errorBody}`);
    }

    const insightsData = await insightsResponse.json();
    const insights: MetaInsights[] = insightsData.data || [];

    // Store metrics in database
    const metricsToInsert = insights.map(insight => ({
      user_id: user.id,
      platform: "meta",
      ad_id: insight.ad_id,
      ad_name: insight.ad_name,
      adset_id: insight.adset_id,
      adset_name: insight.adset_name,
      campaign_id: insight.campaign_id,
      campaign_name: insight.campaign_name,
      date: insight.date_start,
      impressions: parseInt(insight.impressions) || 0,
      clicks: parseInt(insight.clicks) || 0,
      spend: parseFloat(insight.spend) || 0,
      ctr: parseFloat(insight.ctr) || 0,
      cpc: parseFloat(insight.cpc) || 0,
      roas: getPurchaseRoas(insight.purchase_roas),
    }));

    const { error: insertError } = await supabase
      .from("ad_metrics")
      .upsert(metricsToInsert, {
        onConflict: "user_id,platform,ad_id,date"
      });

    if (insertError) {
      console.error("Database insert error:", insertError);
      return NextResponse.json({ error: "Failed to store metrics" }, { status: 500 });
    }

    return NextResponse.json({
      message: "Metrics fetched and stored successfully",
      accountId,
      metricsCount: metricsToInsert.length
    });

  } catch (error) {
    console.error("Meta fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch Meta Ads data" }, { status: 500 });
  }
}
