import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      advertisers: [],
      source: "disabled",
      code: "AUTOCOMPLETE_REFRESH_DISABLED",
      message:
        "Live advertiser discovery is disabled. Use Search & collect to start an explicit ZoopLens collection.",
    },
    { status: 410 },
  );
}
