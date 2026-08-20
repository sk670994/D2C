export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) return new Response("No code");

  // 🔁 Step 1: Get Access Token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${process.env.META_APP_ID}&redirect_uri=${process.env.META_REDIRECT_URI}&client_secret=${process.env.META_APP_SECRET}&code=${code}`
  );

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // 🟢 YOUR ACCOUNT ID
  const accountId = "act_1537304111168748";

  // 📊 Step 2: Fetch campaign insights (REAL DATA)
  const insightsRes = await fetch(
    `https://graph.facebook.com/v18.0/${accountId}/insights?level=campaign&fields=campaign_name,impressions,clicks,spend,ctr,cpc&date_preset=last_7d&access_token=${accessToken}`
  );

  const insightsData = await insightsRes.json();

  return new Response(
    JSON.stringify(insightsData, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
}