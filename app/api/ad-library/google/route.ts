import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  const region = (searchParams.get("region") || "IN").trim().toUpperCase();
  const transparencyUrl = query
    ? `https://adstransparency.google.com/?region=${encodeURIComponent(region)}&search=${encodeURIComponent(query)}`
    : `https://adstransparency.google.com/?region=${encodeURIComponent(region)}`;

  return NextResponse.json({
    provider: "google",
    query,
    region,
    transparencyUrl,
    ads: [],
    note: "Google Ads Transparency Center does not provide a normal global public API for commercial competitor ad search. Open this URL for public Google ad discovery, or add a compliant third-party provider later."
  });
}
