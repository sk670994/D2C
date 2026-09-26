import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { buildHawkyInsight, type IntelligenceRow } from "@/lib/ad-intelligence/hawky/engine";
import { searchContextGraph } from "@/lib/ad-intelligence/hawky/context-search";
import type { AdPlatform } from "@/lib/ad-intelligence/types";

export const runtime="nodejs";
export const preferredRegion="syd1";
export const dynamic="force-dynamic";

function platform(value:string|null):AdPlatform{return value==="google"||value==="linkedin"?value:"meta";}
function mode(value:string|null):"advertiser"|"keyword"{return value==="keyword"?"keyword":"advertiser";}
function country(value:string|null){const v=(value??"IN").trim().toUpperCase();return /^[A-Z]{2}$/.test(v)?v:"IN";}

export async function GET(request:NextRequest){
  try{
    const auth=await createServerAuthClient();
    const {data:{user},error}=await auth.auth.getUser();
    if(error||!user)return NextResponse.json({success:false,error:"Unauthorized"},{status:401});
    const params=request.nextUrl.searchParams;
    const query=(params.get("q")??"").trim().slice(0,120);
    const c=country(params.get("country"));
    const p=platform(params.get("platform"));
    const m=mode(params.get("mode"));
    if(query.length<2)return NextResponse.json({success:true,insight:null,context:[]});

    const client=createGlobalServiceClient();
    const {data,error:queryError}=await client.rpc("adspy_analysis_rows",{p_query:query,p_country:c,p_platform:p,p_mode:m,p_limit:20000});
    if(queryError)throw new Error("Intelligence query failed: "+queryError.message);

    type AnalysisRow = {
      id: string | number; advertiser_name?: string | null; advertiser_id?: string | null; creator_name?: string | null;
      creative_type?: string | null; primary_text?: string | null; offer?: string | null; call_to_action?: string | null;
      first_seen_at?: string | null; last_seen_at?: string | null; is_currently_active?: boolean | null;
    };
    const rows=(data as unknown as AnalysisRow[] | null | undefined ?? []).map((row)=>({
      id:String(row.id), platform:p, advertiserName:row.advertiser_name??"Unknown advertiser", advertiserId:row.advertiser_id??null,
      creatorName:row.creator_name??null, creativeType:row.creative_type??"unknown", primaryText:row.primary_text??null,
      headline:null, description:null, offer:row.offer??null, callToAction:row.call_to_action??null,
      firstSeen:row.first_seen_at??null, lastSeen:row.last_seen_at??null, isActive:row.is_currently_active??null,
      landingPage:null,
    })) as IntelligenceRow[];

    const insight=buildHawkyInsight(rows,{query});
    const context=await searchContextGraph(query,6).catch((error)=>{console.warn("[AdSpy intelligence] context unavailable",error);return[];});
    return NextResponse.json({success:true,query,country:c,platform:p,mode:m,insight,context},{headers:{"Cache-Control":"private, max-age=10, stale-while-revalidate=30"}});
  }catch(error){
    console.error("[AdSpy intelligence]",error);
    return NextResponse.json({success:false,error:error instanceof Error?error.message:"Intelligence failed."},{status:500});
  }
}
