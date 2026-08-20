import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

interface GoogleMetrics {
  adGroup?: {
    id?: string;
    name?: string;
  };
  adGroupAd?: {
    ad?: {
      id?: string;
      name?: string;
      type?: string;
    };
  };
  campaign: {
    resourceName: string;
    id: string;
    name: string;
  };
  metrics: {
    impressions: string;
    clicks: string;
    costMicros: string;
    ctr: number;
    averageCpc: number;
    conversionsValue?: number;
  };
  segments: {
    date: string;
  };
}

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v22";

function normalizeGoogleCustomerId(accountId: string) {
  return accountId.replace(/-/g, "");
}

// POST: Fetch and store Google Ads metrics
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerAuthClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { accountId, dateRange = "LAST_30_DAYS" } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: "Account ID required" }, { status: 400 });
    }

    // Get the access token for this account
    const { data: account, error: accountError } = await supabase
      .from("ad_accounts")
      .select("access_token, refresh_token, token_expiry")
      .eq("user_id", user.id)
      .eq("platform", "google")
      .eq("account_id", accountId)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let accessToken = account.access_token;

    // Check if token is expired and refresh if needed
    if (account.token_expiry && new Date(account.token_expiry) < new Date()) {
      if (account.refresh_token) {
        const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: account.refresh_token,
            grant_type: "refresh_token",
          }),
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          accessToken = refreshData.access_token;

          // Update token in database
          await supabase
            .from("ad_accounts")
            .update({
              access_token: accessToken,
              token_expiry: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
            })
            .eq("user_id", user.id)
            .eq("platform", "google")
            .eq("account_id", accountId);
        }
      }
    }

    const customerId = normalizeGoogleCustomerId(accountId);

    // Fetch ad-level performance data
    const query = `
      SELECT
        campaign.resource_name,
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group.name,
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions_value,
        segments.date
      FROM ad_group_ad
      WHERE ad_group_ad.status = 'ENABLED'
      AND segments.date DURING ${dateRange}
    `;

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        },
        body: JSON.stringify({
          query,
          pageSize: 10000,
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch Google Ads data");
    }

    const data = await response.json();
    const results = data.results || [];

    // Process and store metrics
    const metricsToInsert = results.map((result: GoogleMetrics) => {
      const spend = (parseInt(result.metrics.costMicros) || 0) / 1000000;
      const conversionValue = Number(result.metrics.conversionsValue || 0);

      return {
        user_id: user.id,
        platform: "google",
        ad_id: result.adGroupAd?.ad?.id || result.campaign.id,
        ad_name: result.adGroupAd?.ad?.name || result.adGroupAd?.ad?.type || "Google ad",
        adset_id: result.adGroup?.id || null,
        adset_name: result.adGroup?.name || null,
        campaign_id: result.campaign.id,
        campaign_name: result.campaign.name,
        date: result.segments.date,
        impressions: parseInt(result.metrics.impressions) || 0,
        clicks: parseInt(result.metrics.clicks) || 0,
        spend,
        ctr: (result.metrics.ctr || 0) * 100,
        cpc: (Number(result.metrics.averageCpc) || 0) / 1000000,
        roas: spend > 0 ? conversionValue / spend : 0,
      };
    });

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
      message: "Google Ads metrics fetched and stored successfully",
      metricsCount: metricsToInsert.length
    });

  } catch (error) {
    console.error("Google Ads fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch Google Ads data" }, { status: 500 });
  }
}
