import "server-only";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
import { getMetaGraphVersion } from "@/lib/meta/config";

type StoredMetaAccount = {
  access_token: string | null;
  token_expiry: string | null;
};

type TokenRequest = {
  account: StoredMetaAccount;
  accountId: string;
  userId: string;
  supabase: any;
};

/** Returns plaintext only for the duration of the provider request. */
export async function getMetaAccountToken({ account, accountId, userId, supabase }: TokenRequest) {
  const currentToken = decryptToken(account.access_token);
  if (!currentToken) throw new Error("Meta account has no access token. Reconnect the account.");

  const expiresAt = account.token_expiry ? new Date(account.token_expiry).getTime() : NaN;
  // Refresh a little early so a long provider request cannot cross expiry.
  if (!Number.isFinite(expiresAt) || expiresAt > Date.now() + 5 * 60 * 1000) return currentToken;

  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error("Missing Meta OAuth configuration.");

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: currentToken,
  });
  const response = await fetch(
    `https://graph.facebook.com/${getMetaGraphVersion()}/oauth/access_token?${params.toString()}`,
  );
  const body = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !body?.access_token) {
    throw new Error("Meta token refresh failed. Reconnect the account.");
  }

  const { error } = await supabase
    .from("ad_accounts")
    .update({
      access_token: encryptToken(body.access_token),
      refresh_token: encryptToken(body.access_token),
      token_expiry: typeof body.expires_in === "number"
        ? new Date(Date.now() + body.expires_in * 1000).toISOString()
        : null,
    })
    .eq("user_id", userId)
    .eq("platform", "meta")
    .eq("account_id", accountId);
  if (error) throw new Error("Meta token refreshed but could not be saved.");

  return body.access_token;
}
