"use client";

import { Activity, ArrowUpRight, BrainCircuit, Clock3, Layers3, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type Platform="meta"|"google"|"linkedin";
type Insight={query:string;generatedAt:string;sampleSize:number;activeAds:number;state:"stable"|"evolving"|"shifting";confidence:"low"|"medium"|"high";shiftScore:number;summary:string;signals:Array<{id:string;title:string;summary:string;evidence:string[];confidence:string;changePct:number}>;opportunities:Array<{id:string;title:string;why:string;evidence:string[];confidence:string}>;formatMix:Array<{label:string;count:number;share:number}>;topHooks:Array<{label:string;count:number;share:number}>;topOffers:Array<{label:string;count:number;share:number}>;evidence:string[]};
type Props={query:string;country:string;platform:Platform};

function StatePill({state}:{state:Insight["state"]}){return <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600"><Activity size={11}/>{state}</span>}

export function HawkyIntelligencePanel({query,country,platform}:Props){
  const [insight,setInsight]=useState<Insight|null>(null);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if(query.trim().length<2)return;
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setLoading(true);
      try{
        const url=new URL("/api/ad-intelligence/intelligence",window.location.origin);
        url.searchParams.set("q",query.trim());url.searchParams.set("country",country);url.searchParams.set("platform",platform);url.searchParams.set("mode","advertiser");
        const response=await fetch(url,{cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}});
        const data=await response.json();
        if(!controller.signal.aborted&&response.ok&&data?.success)setInsight(data.insight??null);
      }catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))console.warn("[AdSpy intelligence UI]",error)}finally{if(!controller.signal.aborted)setLoading(false)}
    },500);
    return()=>{controller.abort();window.clearTimeout(timer)};
  },[query,country,platform]);
  if(!query.trim()||(!insight&&!loading))return null;
  if(loading&&!insight)return <section className="mx-auto mt-5 max-w-[1040px] rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3 text-sm font-medium text-slate-600"><span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100"><Sparkles size={15}/></span>Building creative intelligence…</div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-1/3 animate-pulse rounded-full bg-slate-800"/></div></section>;
  if(!insight)return null;
  return <section className="mx-auto mt-5 max-w-[1040px] rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Hawky-style creative intelligence">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600">CREATIVE INTELLIGENCE</span><div className="mt-1 flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold tracking-tight text-slate-950">What changed in the creative system</h3><StatePill state={insight.state}/></div><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{insight.summary}</p></div><div className="flex shrink-0 items-center gap-2 text-xs text-slate-400"><ShieldCheck size={14}/>{insight.confidence} confidence</div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Shift score</div><div className="mt-2 text-xl font-semibold text-slate-950">{insight.shiftScore}<span className="text-xs font-normal text-slate-400"> / 100</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-slate-900" style={{width:Math.min(100,Math.max(0,insight.shiftScore))+"%"}}/></div></div><div className="rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Evidence</div><div className="mt-2 text-xl font-semibold text-slate-950">{insight.sampleSize.toLocaleString("en-IN")}</div><div className="mt-1 text-xs text-slate-500">public creatives analyzed</div></div><div className="rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Current</div><div className="mt-2 text-xl font-semibold text-slate-950">{insight.activeAds.toLocaleString("en-IN")}</div><div className="mt-1 text-xs text-slate-500">marked observable / active</div></div></div>
    {insight.signals.length>0&&<div className="mt-5 grid gap-3 lg:grid-cols-2">{insight.signals.slice(0,4).map((signal)=><details key={signal.id} className="group rounded-2xl border border-slate-200 p-4"><summary className="cursor-pointer list-none"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white"><BrainCircuit size={14}/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-950">{signal.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{signal.summary}</span></span><ArrowUpRight size={14} className="text-slate-300 transition-transform group-open:rotate-45"/></div></summary><div className="mt-3 ml-11 space-y-1.5">{signal.evidence.map((e,i)=><p key={i} className="text-xs leading-5 text-slate-600">{e}</p>)}</div></details>)}</div>}
    <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr]">{insight.opportunities.slice(0,3).map((item)=><div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-blue-600"><Layers3 size={12}/>Opportunity</div><div className="mt-2 text-sm font-semibold text-slate-950">{item.title}</div><p className="mt-1 text-xs leading-5 text-slate-500">{item.why}</p><div className="mt-3 space-y-1">{item.evidence.map((e,i)=><p key={i} className="text-[11px] leading-5 text-slate-600">{e}</p>)}</div></div>)}<div className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Clock3 size={12}/>Top observable mix</div><div className="mt-3 space-y-2">{insight.formatMix.slice(0,4).map((x)=><div key={x.label} className="flex items-center justify-between gap-4 text-xs"><span className="font-medium text-slate-700">{x.label}</span><span className="text-slate-400">{x.count} · {x.share}%</span></div>)}</div></div></div>
    <div className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-slate-400"><ShieldCheck size={14} className="mt-0.5 shrink-0"/>Observational intelligence only. Competitor public data does not expose reliable per-ad performance, so this layer does not manufacture ROAS, CTR, spend, reach, or causal claims.</div>
  </section>;
}
