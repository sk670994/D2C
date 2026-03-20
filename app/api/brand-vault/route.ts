import { NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

type BrandVaultPayload = {
  brandName?: string;
  websiteUrl?: string;
  tone?: string;
  audience?: string;
  doNotSay?: string;
  heroProduct?: string;
  mainObjection?: string;
  competitorFocus?: string;
};


type BrandVaultRow = {
  brand_name: string | null;
  website_url: string | null;
  tone: string | null;
  audience: string | null;
  do_not_say: string | null;
  hero_product: string | null;
  main_objection: string | null;
  competitor_focus: string | null;
  updated_at: string | null;
};

function toClient(row: BrandVaultRow) {
  return {
    brandName: row.brand_name ?? "",
    websiteUrl: row.website_url ?? "",
    tone: row.tone ?? "",
    audience: row.audience ?? "",
    doNotSay: row.do_not_say ?? "",
    heroProduct: row.hero_product ?? "",
    mainObjection: row.main_objection ?? "",
    competitorFocus: row.competitor_focus ?? "",
    updatedAt: row.updated_at ?? null
  };
}

export async function GET() {
  try {
    const authClient = await createServerAuthClient();
    const {
      data: { user },
      error: userError
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await authClient
      .from("brand_vaults")
      .select("brand_name,website_url,tone,audience,do_not_say,hero_product,main_objection,competitor_focus,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ brandVault: data ? toClient(data as BrandVaultRow) : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authClient = await createServerAuthClient();
    const {
      data: { user },
      error: userError
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as BrandVaultPayload;
    const payload = {
      user_id: user.id,
      user_email: user.email ?? null,
      brand_name: body.brandName?.trim() || null,
      website_url: body.websiteUrl?.trim() || null,
      tone: body.tone?.trim() || null,
      audience: body.audience?.trim() || null,
      do_not_say: body.doNotSay?.trim() || null,
      hero_product: body.heroProduct?.trim() || null,
      main_objection: body.mainObjection?.trim() || null,
      competitor_focus: body.competitorFocus?.trim() || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await authClient
      .from("brand_vaults")
      .upsert(payload, { onConflict: "user_id" })
      .select("brand_name,website_url,tone,audience,do_not_say,hero_product,main_objection,competitor_focus,updated_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ brandVault: data ? toClient(data as BrandVaultRow) : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

