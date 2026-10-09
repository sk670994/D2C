/**
 * Ad images for public pages, served through Vercel's CDN.
 *
 * Stored ad images live in Supabase Storage (Sydney). Fetched directly from
 * India each one takes about a second. This route proxies only that bucket and
 * marks the response immutable, so Vercel's edge (including Mumbai) caches it
 * and later visitors get it in milliseconds. It never proxies other hosts.
 *
 * /m/s3/<key> reads from our private AWS S3 bucket (signed request), so the
 * bucket never has to be public.
 */
import { getS3Object } from "@/lib/media/r2";

const BUCKET = "ad-media";
const SAFE_PATH = /^[a-z0-9][a-z0-9/_.-]{2,200}\.(webp|jpe?g|png|gif)$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = (path ?? []).join("/");
  if (!SAFE_PATH.test(key) || key.includes("..")) return new Response("Not found", { status: 404 });

  let upstream: Response | null;
  if (key.startsWith("s3/")) {
    upstream = await getS3Object(key.slice(3));
  } else {
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
    if (!base) return new Response("Not configured", { status: 503 });
    upstream = await fetch(`${base}/storage/v1/object/public/${BUCKET}/${key}`, { cache: "no-store" }).catch(() => null);
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    // Short negative cache so a missing image is retried later, not forever.
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/webp",
      // Object keys never change content (each ad has its own key), so cache for a year everywhere.
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
