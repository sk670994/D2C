import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";

const ALLOWED_HOSTS = [
  "facebook.com",
  "fbcdn.net",
  "fbsbx.com",
  "instagram.com",
  "cdninstagram.com",
];

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

function allowed(url: URL) {
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Login required: previously this was an open image proxy.
  const auth = await createServerAuthClient();
  const userId = await getVerifiedUserId(auth);
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return new NextResponse("Missing url", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (!allowed(target)) {
    return new NextResponse("Media host not allowed", { status: 403 });
  }

  try {
    let response: Response | null = null;

    // Follow redirects manually so every hop is re-checked against the allowlist.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetch(target.toString(), {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
          Referer: "https://www.facebook.com/",
        },
        redirect: "manual",
        cache: "force-cache",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get("location");
      if (!location) break;

      const next = new URL(location, target);
      if (!allowed(next)) {
        return new NextResponse("Media redirect not allowed", { status: 403 });
      }
      target = next;
      response = null;
    }

    if (!response || !response.ok) {
      return new NextResponse("Upstream media unavailable", { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    // SVG can carry script; only serve raster images.
    if (!contentType.startsWith("image/") || contentType.includes("svg")) {
      return new NextResponse("Not an image", { status: 415 });
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Media fetch failed", { status: 502 });
  }
}
