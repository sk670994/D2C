import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import {
  createOAuthState,
  oauthStateCookieOptions,
  verifyOAuthState,
} from "@/lib/oauth-state";
import { encryptToken } from "@/lib/security/token-crypto";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v22";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

function getRedirectUri(request: NextRequest) {
  return process.env.GOOGLE_ADS_REDIRECT_URI || `${new URL(request.url).origin}/api/integrations/google-ads`;
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
    "google",
    user?.id ?? "",
  );

  if (!user || !validState || request.cookies.get("oauth_google_state")?.value !== state) {
    return NextResponse.json({ error: "Invalid or expired OAuth state" }, { status: 400 });
  }

  try {
    const redirectUri = getRedirectUri(request);

    // Exchange code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange code for token");
    }

    const tokenData: GoogleTokenResponse = await tokenResponse.json();

    // Get user ID from state
    // Get accessible customer IDs (this is a simplified version)
    // In production, you'd use the Google Ads API to list accessible customers
    const customersResponse = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
        },
      }
    );

    if (!customersResponse.ok) {
      throw new Error("Failed to fetch customer accounts");
    }

    const customersData = await customersResponse.json();
    const customerIds = customersData.resourceNames || [];

    // Store Google Ads accounts in database
    for (const customerId of customerIds) {
      const accountId = customerId.split("/")[1];
      await supabase
        .from("ad_accounts")
        .upsert({
          user_id: user.id,
          platform: "google",
          account_id: accountId,
          account_name: accountId,
          access_token: encryptToken(tokenData.access_token),
          refresh_token: encryptToken(tokenData.refresh_token),
          token_expiry: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        }, { onConflict: "user_id,platform,account_id" });
    }

    // Redirect to dashboard with success
    const response = NextResponse.redirect(new URL("/dashboard?google_connected=true", request.url));
    response.cookies.delete("oauth_google_state");
    return response;

  } catch (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(new URL("/dashboard?google_error=true", request.url));
  }
}

// POST: Connect Google Ads account (initiate OAuth)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerAuthClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = "https://www.googleapis.com/auth/adwords";
    const redirectUri = getRedirectUri(request);
    const state = createOAuthState("google", user.id);
    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

    const response = NextResponse.json({ oauth_url: oauthUrl });
    response.cookies.set("oauth_google_state", state, oauthStateCookieOptions);
    return response;

  } catch (error) {
    console.error("Google connect error:", error);
    return NextResponse.json({ error: "Failed to initiate Google connection" }, { status: 500 });
  }
}

