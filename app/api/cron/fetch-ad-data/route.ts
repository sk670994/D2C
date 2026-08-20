import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

// Vercel Cron job to fetch ad data from all connected accounts
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createServerAuthClient();

    // Fetch all connected ad accounts
    const { data: accounts, error: accountsError } = await supabase
      .from("ad_accounts")
      .select("user_id, platform, account_id, access_token, refresh_token, token_expiry");

    if (accountsError) {
      console.error("Accounts fetch error:", accountsError);
      return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No connected accounts found" });
    }

    const results = {
      totalAccounts: accounts.length,
      processed: 0,
      errors: 0,
      details: [] as any[],
    };

    for (const account of accounts) {
      try {
        let accessToken = account.access_token;

        // 🔁 TOKEN REFRESH LOGIC
        if (account.token_expiry && new Date(account.token_expiry) < new Date()) {
          if (account.refresh_token) {
            if (account.platform === "google") {
              const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  client_id: process.env.GOOGLE_CLIENT_ID!,
                  client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                  refresh_token: account.refresh_token,
                  grant_type: "refresh_token",
                }),
              });

              if (refreshResponse.ok) {
                const data = await refreshResponse.json();
                accessToken = data.access_token;

                await supabase
                  .from("ad_accounts")
                  .update({
                    access_token: accessToken,
                    token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
                  })
                  .eq("user_id", account.user_id)
                  .eq("platform", account.platform)
                  .eq("account_id", account.account_id);
              }
            }

            if (account.platform === "meta") {
              const refreshResponse = await fetch(
                `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${account.refresh_token}`
              );

              if (refreshResponse.ok) {
                const data = await refreshResponse.json();
                accessToken = data.access_token;

                await supabase
                  .from("ad_accounts")
                  .update({
                    access_token: accessToken,
                    token_expiry: data.expires_in
                      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
                      : null,
                  })
                  .eq("user_id", account.user_id)
                  .eq("platform", account.platform)
                  .eq("account_id", account.account_id);
              }
            }
          }
        }

        // 📊 FETCH DATA
        let fetchResult;

        if (account.platform === "meta") {
          fetchResult = await fetchMetaData(
            account.account_id,
            accessToken,
            account.user_id,
            supabase
          );
        }

        if (account.platform === "google") {
          fetchResult = await fetchGoogleData(
            account.account_id,
            accessToken,
            account.user_id,
            supabase
          );
        }

        results.processed++;
        results.details.push({
          platform: account.platform,
          accountId: account.account_id,
          success: true,
          metricsCount: fetchResult?.metricsCount || 0,
        });

      } catch (error) {
        console.error("Account error:", error);

        results.errors++;
        results.details.push({
          platform: account.platform,
          accountId: account.account_id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

//
// 🔵 META FETCH
//
async function fetchMetaData(
  accountId: string,
  accessToken: string,
  userId: string,
  supabase: any
) {
  const metaAccountId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${metaAccountId}/insights?level=ad&fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,date_start,impressions,clicks,spend,ctr,cpc,purchase_roas&date_preset=last_7d&access_token=${accessToken}`
  );

  if (!response.ok) throw new Error("Meta fetch failed");

  const data = await response.json();
  const insights = data.data || [];

  const metrics = insights.map((i: any) => ({
    user_id: userId,
    platform: "meta",
    ad_id: i.ad_id,
    ad_name: i.ad_name,
    adset_id: i.adset_id,
    adset_name: i.adset_name,
    campaign_id: i.campaign_id,
    campaign_name: i.campaign_name,
    date: i.date_start,
    impressions: parseInt(i.impressions) || 0,
    clicks: parseInt(i.clicks) || 0,
    spend: parseFloat(i.spend) || 0,
    ctr: parseFloat(i.ctr) || 0,
    cpc: parseFloat(i.cpc) || 0,
    roas: i.purchase_roas?.[0]?.value
      ? parseFloat(i.purchase_roas[0].value)
      : 0,
  }));

  await supabase
    .from("ad_metrics")
    .upsert(metrics, {
      onConflict: "user_id,platform,ad_id,date",
    });

  return { metricsCount: metrics.length };
}

//
// 🟢 GOOGLE FETCH
//
async function fetchGoogleData(
  accountId: string,
  accessToken: string,
  userId: string,
  supabase: any
) {
  const googleAdsVersion = process.env.GOOGLE_ADS_API_VERSION || "v22";
  const customerId = accountId.replace(/-/g, "");
  const query = `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions_value,
      segments.date
    FROM ad_group_ad
    WHERE ad_group_ad.status = 'ENABLED'
    AND segments.date DURING LAST_7_DAYS
  `;

  const response = await fetch(
    `https://googleads.googleapis.com/${googleAdsVersion}/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!response.ok) throw new Error("Google Ads fetch failed");

  const data = await response.json();
  const results = data.results || [];

  const metrics = results.map((r: any) => {
    const spend = (parseInt(r.metrics.costMicros) || 0) / 1000000;
    const conversionValue = Number(r.metrics.conversionsValue || 0);

    return {
      user_id: userId,
      platform: "google",
      ad_id: r.adGroupAd?.ad?.id || r.campaign.id,
      ad_name: r.adGroupAd?.ad?.name || r.adGroupAd?.ad?.type || "Google ad",
      adset_id: r.adGroup?.id || null,
      adset_name: r.adGroup?.name || null,
      campaign_id: r.campaign.id,
      campaign_name: r.campaign.name,
      date: r.segments.date,
      impressions: parseInt(r.metrics.impressions) || 0,
      clicks: parseInt(r.metrics.clicks) || 0,
      spend,
      ctr: (r.metrics.ctr || 0) * 100,
      cpc: (Number(r.metrics.averageCpc) || 0) / 1000000,
      roas: spend > 0 ? conversionValue / spend : 0,
    };
  });

  await supabase
    .from("ad_metrics")
    .upsert(metrics, {
      onConflict: "user_id,platform,ad_id,date",
    });

  return { metricsCount: metrics.length };
}
