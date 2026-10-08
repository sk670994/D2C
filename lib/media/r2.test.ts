import { expect, it } from "vitest";

import { getS3Object, isR2Url, mediaKeyFor, signR2Request, sigv4 } from "./r2";

it("matches AWS's published SigV4 example (GET object with Range)", () => {
  const out = sigv4({
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/test.txt",
    region: "us-east-1",
    service: "s3",
    headers: { range: "bytes=0-9" },
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    now: new Date("2013-05-24T00:00:00Z"),
  });
  expect(out.signedHeaders).toBe("host;range;x-amz-content-sha256;x-amz-date");
  expect(out.signature).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
});

const config = { accountId: "acc123", accessKeyId: "AK", secretAccessKey: "SK", bucket: "zooptrack-media", publicBaseUrl: "https://media.zooptrack.co.in" };

it("signs path-style R2 uploads", () => {
  const body = new Uint8Array([1, 2, 3]);
  const key = mediaKeyFor(body, "webp");
  expect(key).toMatch(/^ads\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/);
  expect(mediaKeyFor(new Uint8Array([1, 2, 3]), "webp")).toBe(key);
  const signed = signR2Request({ config, method: "PUT", key, body, contentType: "image/webp", now: new Date("2026-09-28T10:15:00Z") });
  expect(signed.url).toBe(`https://acc123.r2.cloudflarestorage.com/zooptrack-media/${key}`);
  expect(signed.headers["x-amz-date"]).toBe("20260928T101500Z");
  expect(signed.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/20260928\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
});

it("recognises our public media URLs", () => {
  expect(isR2Url("https://media.zooptrack.co.in/ads/ab/x.webp", config)).toBe(true);
  expect(isR2Url("https://scontent.fbcdn.net/x.jpg", config)).toBe(false);
  expect(isR2Url("https://media.zooptrack.co.in/ads/ab/x.webp", null)).toBe(false);
});

const s3 = { kind: "s3" as const, region: "ap-south-1", accountId: "", accessKeyId: "AK", secretAccessKey: "SK", bucket: "zooptrack-media", publicBaseUrl: "https://www.zooptrack.co.in/m/s3" };

it("signs virtual-hosted AWS S3 requests in the bucket's region", () => {
  const signed = signR2Request({ config: s3, method: "PUT", key: "ads/ab/x.webp", body: new Uint8Array([1]), contentType: "image/webp", now: new Date("2026-10-09T10:00:00Z") });
  expect(signed.url).toBe("https://zooptrack-media.s3.ap-south-1.amazonaws.com/ads/ab/x.webp");
  expect(signed.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/20261009\/ap-south-1\/s3\/aws4_request, /);
  expect(isR2Url("https://www.zooptrack.co.in/m/s3/ads/ab/x.webp", s3)).toBe(true);
});

it("reads private S3 objects with a signed GET", async () => {
  let seen = "";
  const fake = (async (url: string, init?: RequestInit) => {
    seen = url;
    expect((init?.headers as Record<string, string>).Authorization).toMatch(/ap-south-1\/s3/);
    return new Response("img", { status: 200 });
  }) as unknown as typeof fetch;
  const res = await getS3Object("ads/ab/x.webp", { config: s3, fetchImpl: fake });
  expect(seen).toBe("https://zooptrack-media.s3.ap-south-1.amazonaws.com/ads/ab/x.webp");
  expect(res && (await res.text())).toBe("img");
  const missing = await getS3Object("ads/ab/y.webp", { config: s3, fetchImpl: (async () => new Response("", { status: 404 })) as unknown as typeof fetch });
  expect(missing).toBeNull();
});
