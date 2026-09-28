/**
 * Cloudflare R2 (S3-compatible) uploads with AWS Signature V4, no SDK.
 * 10 GB storage free per month and no egress fees: ad images live here so
 * Supabase stays within its Free plan.
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 *      R2_PUBLIC_BASE_URL (the bucket's public r2.dev URL or a custom domain)
 */
import { createHash, createHmac } from "node:crypto";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

const env = (name: string) => process.env[name]?.trim().replace(/^["']|["']$/g, "") || "";

export function r2Config(): R2Config | null {
  const c = {
    accountId: env("R2_ACCOUNT_ID"),
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    bucket: env("R2_BUCKET"),
    publicBaseUrl: env("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  };
  return c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket && c.publicBaseUrl ? c : null;
}

const sha256hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding per path segment (S3 canonical URI rules). */
function encodePath(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

/** Generic AWS SigV4 (header auth). Exported for the test against AWS's published example. */
export function sigv4(input: {
  method: string;
  host: string;
  path: string;
  region: string;
  service: string;
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
}): { amzDate: string; signedHeaders: string; signature: string; authorization: string } {
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20260928T101500Z
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: input.host, "x-amz-content-sha256": input.payloadHash, "x-amz-date": amzDate };
  for (const [k, v] of Object.entries(input.headers)) headers[k.toLowerCase()] = v;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim()}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [input.method, input.path, "", canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kSigning = hmac(hmac(hmac(kDate, input.region), input.service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return {
    amzDate,
    signedHeaders,
    signature,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** Signed request for one R2 object (path-style: /bucket/key, region "auto"). */
export function signR2Request(input: {
  config: R2Config;
  method: "PUT" | "HEAD" | "DELETE" | "GET";
  key: string;
  body?: Uint8Array;
  contentType?: string;
  extraHeaders?: Record<string, string>;
  now?: Date;
}): { url: string; headers: Record<string, string> } {
  const { config } = input;
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = `/${config.bucket}/${encodePath(input.key)}`;
  const payloadHash = sha256hex(input.body ?? new Uint8Array());
  const extra: Record<string, string> = { ...(input.extraHeaders ?? {}) };
  if (input.contentType) extra["content-type"] = input.contentType;
  const signed = sigv4({
    method: input.method,
    host,
    path,
    region: "auto",
    service: "s3",
    headers: extra,
    payloadHash,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    now: input.now ?? new Date(),
  });
  return {
    url: `https://${host}${path}`,
    headers: {
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k.toLowerCase(), v])),
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": signed.amzDate,
      Authorization: signed.authorization,
    },
  };
}

/** Content-addressed key: identical images are stored once. */
export function mediaKeyFor(bytes: Uint8Array, ext: string): string {
  const hash = sha256hex(bytes);
  return `ads/${hash.slice(0, 2)}/${hash}.${ext}`;
}

export function r2PublicUrl(config: R2Config, key: string): string {
  return `${config.publicBaseUrl}/${key}`;
}

export function isR2Url(value: string | null | undefined, config: R2Config | null = r2Config()): boolean {
  return Boolean(config && value && value.startsWith(`${config.publicBaseUrl}/`));
}

/** Upload (idempotent: same bytes -> same key). Returns the public URL. */
export async function putR2Object(
  bytes: Uint8Array,
  contentType: string,
  ext: string,
  options: { config?: R2Config | null; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const config = options.config ?? r2Config();
  if (!config) return null;
  const key = mediaKeyFor(bytes, ext);
  const signed = signR2Request({ config, method: "PUT", key, body: bytes, contentType, extraHeaders: { "cache-control": "public, max-age=31536000, immutable" } });
  const response = await (options.fetchImpl ?? fetch)(signed.url, {
    method: "PUT",
    headers: signed.headers,
    body: Buffer.from(bytes),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    console.warn("[r2] upload failed", response.status, (await response.text().catch(() => "")).slice(0, 200));
    return null;
  }
  return r2PublicUrl(config, key);
}
