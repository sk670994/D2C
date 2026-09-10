import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import {
  createOAuthState,
  oauthStateCookieOptions,
  verifyOAuthState,
} from "@/lib/oauth-state";
import { encryptToken } from "@/lib/security/token-crypto";
import { getMetaGraphVersion } from "@/lib/meta/config";

const META_APP_ID = process.env.META_APP_ID!;
const META_APP_SECRET = process.env.META_APP_SECRET!;

interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface MetaAccount {
  account_id: string;
  id: string;
  name: string;
}

function getRedirectUri(request: NextRequest) {
  return process.env.META_ADS_REDIRECT_URI || `${new URL(request.url).origin}/api/integrations/meta-ads`;
}

// GET: Handle OAuth callback
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return NextResponse.json({ error: "No authorization code provided" }, { status: 400 });
  }

  const supabase = await createServerAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  const validState = verifyOAuthState(
    state ?? undefined,
    "meta",
    user?.id ?? "",
  );

  if (!user || !validState || request.cookies.get("oauth_meta_state")?.value !== state) {
    return NextResponse.json({ error: "Invalid or expired OAuth state" }, { status: 400 });
  }

  try {
    const redirectUri = getRedirectUri(request);

    // Exchange code for access token
    const tokenResponse = await fetch(
      `https://graph.facebook.com/${getMetaGraphVersion()}/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${META_APP_SECRET}&code=${code}`,
      { method: "GET" }
    );

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange code for token");
    }

    const tokenData: MetaTokenResponse = await tokenResponse.json();
    const longLivedTokenResponse = await fetch(
      `https://graph.facebook.com/${getMetaGraphVersion()}/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: tokenData.access_token,
      }).toString()}`,
    );
    const longLivedToken: MetaTokenResponse = longLivedTokenResponse.ok
      ? await longLivedTokenResponse.json()
      : tokenData;

    // Get user ID from state (assuming it's passed as user_id)
    // Get ad accounts for this user
    const accountsResponse = await fetch(
      `https://graph.facebook.com/${getMetaGraphVersion()}/me/adaccounts?fields=account_id,id,name&access_token=${encodeURIComponent(longLivedToken.access_token)}`
    );

    if (!accountsResponse.ok) {
      throw new Error("Failed to fetch ad accounts");
    }

    const accountsData = await accountsResponse.json();

    // Store ad accounts in database
    for (const account of (accountsData.data || []) as MetaAccount[]) {
      await supabase
        .from("ad_accounts")
        .upsert({
          user_id: user.id,
          platform: "meta",
          account_id: account.account_id,
          account_name: account.name,
          access_token: encryptToken(longLivedToken.access_token),
          refresh_token: encryptToken(longLivedToken.access_token),
          token_expiry: longLivedToken.expires_in
            ? new Date(Date.now() + longLivedToken.expires_in * 1000).toISOString()
            : null,
        }, { onConflict: "user_id,platform,account_id" });
    }

    // Redirect to dashboard with success
    const response = NextResponse.redirect(new URL("/dashboard?meta_connected=true", request.url));
    response.cookies.delete("oauth_meta_state");
    return response;

  } catch (error) {
    console.error("Meta OAuth error:", error);
    return NextResponse.redirect(new URL("/dashboard?meta_error=true", request.url));
  }
}

// POST: Connect Meta Ads account (initiate OAuth)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerAuthClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = "ads_read";
    const redirectUri = getRedirectUri(request);
    const state = createOAuthState("meta", user.id);
    const oauthUrl = `https://www.facebook.com/${getMetaGraphVersion()}/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}`;

    const response = NextResponse.json({ oauth_url: oauthUrl });
    response.cookies.set("oauth_meta_state", state, oauthStateCookieOptions);
    return response;

  } catch (error) {
    console.error("Meta connect error:", error);
    return NextResponse.json({ error: "Failed to initiate Meta connection" }, { status: 500 });
  }
}

