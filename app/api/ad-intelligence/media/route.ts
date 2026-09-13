import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = [
  "facebook.com",
  "fbcdn.net",
  "fbsbx.com",
  "instagram.com",
  "cdninstagram.com",
  "xx.fbcdn.net",
];

function allowed(url: URL) {
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

  if (!["http:", "https:"].includes(target.protocol) || !allowed(target)) {
    return new NextResponse("Media host not allowed", { status: 403 });
  }

  try {
    const response = await fetch(target.toString(), {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
        Referer: "https://www.facebook.com/",
      },
      cache: "force-cache",
    });

    if (!response.ok) {
      return new NextResponse("Upstream media unavailable", { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new NextResponse("Not an image", { status: 415 });
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch {
    return new NextResponse("Media fetch failed", { status: 502 });
  }
}
