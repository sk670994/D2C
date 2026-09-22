import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validPageId(value: string) {
  const v = value.trim();
  return /^\d+$/.test(v) ? v : null;
}

function validCountry(value: string | null) {
  const v = (value ?? "IN").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : "IN";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ pageId: string }> },
) {
  const auth = await createServerAuthClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { pageId: rawPageId } = await context.params;
  const pageId = validPageId(decodeURIComponent(rawPageId));

  if (!pageId) {
    return NextResponse.json({ success: false, error: "Invalid Meta Page ID." }, { status: 400 });
  }

  const country = validCountry(request.nextUrl.searchParams.get("country"));
  const service = createGlobalServiceClient();

  const [profile, timeline, changes, watch] = await Promise.all([
    service.rpc("adspy_get_advertiser_profile", {
      p_page_id: pageId,
      p_country: country,
      p_platform: "meta",
    }),
    service.rpc("adspy_get_advertiser_timeline", {
      p_page_id: pageId,
      p_country: country,
      p_platform: "meta",
      p_months: 12,
    }),
    service.rpc("adspy_get_advertiser_changes", {
      p_page_id: pageId,
      p_country: country,
      p_platform: "meta",
      p_days: 30,
    }),
    auth
      .from("adspy_advertiser_watchlists")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "meta")
      .eq("advertiser_id", pageId)
      .eq("country", country)
      .maybeSingle(),
  ]);

  for (const result of [profile, timeline, changes, watch]) {
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    pageId,
    country,
    profile: profile.data ?? null,
    timeline: timeline.data ?? [],
    changes: changes.data ?? null,
    watching: Boolean(watch.data),
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ pageId: string }> },
) {
  const auth = await createServerAuthClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { pageId: rawPageId } = await context.params;
  const pageId = validPageId(decodeURIComponent(rawPageId));
  if (!pageId) {
    return NextResponse.json({ success: false, error: "Invalid Meta Page ID." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const country = validCountry(typeof body?.country === "string" ? body.country : request.nextUrl.searchParams.get("country"));
  const service = createGlobalServiceClient();

  const { data: profile } = await service.rpc("adspy_get_advertiser_profile", {
    p_page_id: pageId,
    p_country: country,
    p_platform: "meta",
  });

  const { error } = await auth
    .from("adspy_advertiser_watchlists")
    .upsert(
      {
        user_id: user.id,
        platform: "meta",
        advertiser_id: pageId,
        advertiser_name:
          profile && typeof profile === "object"
            ? String((profile as Record<string, unknown>).advertiserName ?? "")
            : null,
        country,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform,advertiser_id,country" },
    );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, watching: true });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ pageId: string }> },
) {
  const auth = await createServerAuthClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { pageId: rawPageId } = await context.params;
  const pageId = validPageId(decodeURIComponent(rawPageId));
  if (!pageId) {
    return NextResponse.json({ success: false, error: "Invalid Meta Page ID." }, { status: 400 });
  }

  const country = validCountry(request.nextUrl.searchParams.get("country"));

  const { error } = await auth
    .from("adspy_advertiser_watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", "meta")
    .eq("advertiser_id", pageId)
    .eq("country", country);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, watching: false });
}
