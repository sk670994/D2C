/* eslint-disable @next/next/no-img-element */

"use client";

import { X } from "lucide-react";
import type { Ad } from "../adspy-types";

function safeUrl(value?: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.toString() : null; } catch { return null; }
}

export function AdSpyCreativeModal({ ad, onClose }: { ad: Ad; onClose: () => void }) {
  const media = safeUrl(ad.thumbnailUrl || ad.imageUrl);
  const landing = safeUrl(ad.landingPage);
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm md:items-center">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Creative inspection</div><h2 className="mt-1 text-xl font-bold text-slate-950">{ad.headline || ad.productName || "Untitled creative"}</h2><p className="mt-1 text-sm text-slate-500">{ad.advertiserName || "Unknown advertiser"}</p></div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={16} /></button>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl bg-slate-100">{media ? <img src={media} alt="" className="max-h-[520px] w-full object-contain" /> : <div className="grid h-64 place-items-center text-sm text-slate-400">Media unavailable</div>}</div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-400">Primary text</div><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{ad.primaryText || "No copy captured."}</p></div>
          <div className="space-y-3"><div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-slate-400">Offer</div><div className="mt-1 text-sm font-bold text-slate-800">{ad.offer || "—"}</div></div><div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-slate-400">Landing page</div>{landing ? <a href={landing} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm font-bold text-blue-600">{ad.landingPage}</a> : <div className="mt-1 text-sm font-bold text-slate-800">—</div>}</div></div>
        </div>
      </div>
    </div>
  );
}


