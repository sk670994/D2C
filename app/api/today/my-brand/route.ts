import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";
import { startAdSpyCollection } from "@/lib/ad-intelligence/jobs/start-collection";
import { getOwnBrand } from "@/lib/today/load";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

function cleanUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString().slice(0, 300) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await createServerAuthClient();
  const userId = await getVerifiedUserId(auth);
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, brand: await getOwnBrand(userId) });
}

/** Save "your brand": name, store URL and the Meta page it advertises from. */
export async function POST(request: NextRequest) {
  const auth = await createServerAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { brandName?: unknown; websiteUrl?: unknown; pageId?: unknown };
  const brandName = String(body.brandName ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const pageId = String(body.pageId ?? "").trim();
  if (brandName.length < 2) return NextResponse.json({ success: false, error: "Add your brand name." }, { status: 400 });
  if (pageId && !/^\d+$/.test(pageId)) return NextResponse.json({ success: false, error: "Invalid Meta Page ID." }, { status: 400 });

  const { error } = await auth.from("brand_vaults").upsert(
    {
      user_id: user.id,
      user_email: user.email ?? null,
      brand_name: brandName,
      website_url: cleanUrl(body.websiteUrl),
      own_page_id: pageId || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    const missing = /own_page_id/i.test(error.message);
    return NextResponse.json(
      { success: false, error: missing ? "Run the latest database update (own_page_id) first." : error.message },
      { status: missing ? 503 : 500 },
    );
  }

  if (pageId) {
    // Read your own ads too, so "Vs you" has data.
    await startAdSpyCollection({
      userId: user.id,
      query: brandName,
      country: "IN",
      platform: "meta",
      mode: "advertiser",
      pageId,
      minIntervalMs: 30 * 60_000,
      reason: "user",
    }).catch((reason) => console.warn("[my-brand] collection kickoff failed", reason instanceof Error ? reason.message : reason));
  }

  return NextResponse.json({ success: true, brand: await getOwnBrand(user.id) });
}
