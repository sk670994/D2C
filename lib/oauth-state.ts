import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const STATE_TTL_SECONDS = 10 * 60;

type OAuthStatePayload = {
  provider: "meta" | "google";
  userId: string;
  nonce: string;
  expiresAt: number;
};

function getSecret() {
  const secret = process.env.OAUTH_STATE_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing OAUTH_STATE_SECRET.");
  }
  return secret;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createOAuthState(
  provider: OAuthStatePayload["provider"],
  userId: string,
) {
  const payload: OAuthStatePayload = {
    provider,
    userId,
    nonce: crypto.randomUUID(),
    expiresAt: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyOAuthState(
  value: string | undefined,
  expectedProvider: OAuthStatePayload["provider"],
  expectedUserId: string,
) {
  if (!value) return false;

  const [encoded, receivedSignature] = value.split(".");
  if (!encoded || !receivedSignature) return false;

  const expectedSignature = signature(encoded);
  const receivedBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(decode(encoded)) as OAuthStatePayload;
    return (
      payload.provider === expectedProvider &&
      payload.userId === expectedUserId &&
      payload.expiresAt >= Math.floor(Date.now() / 1000) &&
      typeof payload.nonce === "string" &&
      payload.nonce.length > 0
    );
  } catch {
    return false;
  }
}

export const oauthStateCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: STATE_TTL_SECONDS,
  path: "/",
};
