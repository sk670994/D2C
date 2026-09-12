/* eslint-disable @next/next/no-img-element */

"use client";

import { ExternalLink, Image as ImageIcon, Layers3, Play, Sparkles, Video } from "lucide-react";
import { useState } from "react";
import type { Ad } from "../adspy-types";

function safeUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function truncate(value?: string | null, size = 150) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "No copy captured from the public source.";
  return text.length > size ? `${text.slice(0, size).trim()}…` : text;
}

export function AdSpyCreativeCard({ ad, onInspect }: { ad: Ad; onInspect: () => void }) {
  const [playing, setPlaying] = useState(false);
  const image = safeUrl(ad.thumbnailUrl || ad.imageUrl);
  const video = safeUrl(ad.videoUrl);
  const source = safeUrl(ad.sourceUrl);
  const type = ad.creativeType || (video ? "video" : "image");
  const active = ad.isActive !== false;

  return (
    <article className="group overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_55px_rgba(15,23,42,.12)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {playing && video ? (
          <video src={video} poster={image ?? undefined} controls autoPlay playsInline preload="metadata" className="h-full w-full object-cover" onEnded={() => setPlaying(false)} onError={() => setPlaying(false)} />
        ) : image ? (
          <img src={image} alt={ad.headline || ad.productName || ad.advertiserName || "Ad creative"} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-400"><ImageIcon size={38} /><span>Media unavailable</span></div>
        )}

        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${active ? "bg-emerald-500 text-white" : "bg-slate-950/80 text-white"}`}>{active ? "Active" : "Inactive"}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-950/65 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">{type === "video" ? <Video size={12} /> : type === "carousel" ? <Layers3 size={12} /> : <ImageIcon size={12} />}{type}</span>
        </div>

        {video && !playing ? <button type="button" onClick={() => setPlaying(true)} aria-label="Play video" title="Play video" className="absolute bottom-3 left-3 grid h-10 w-10 place-items-center rounded-full bg-white text-slate-950 shadow-xl transition hover:scale-105"><Play size={16} fill="currentColor" /></button> : null}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{ad.advertiserName || "Unknown advertiser"}</div>
            <h3 className="mt-1 line-clamp-2 text-base font-bold leading-6 text-slate-950">{ad.headline || ad.productName || "Untitled creative"}</h3>
          </div>
          {ad.runningDays ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{ad.runningDays}d</span> : null}
        </div>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{truncate(ad.primaryText || ad.description)}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-xs">
          <div><div className="text-slate-400">First seen</div><div className="mt-1 font-semibold text-slate-800">{dateLabel(ad.firstSeen)}</div></div>
          <div><div className="text-slate-400">CTA</div><div className="mt-1 truncate font-semibold text-slate-800">{ad.callToAction || "—"}</div></div>
        </div>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onInspect} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"><Sparkles size={14} />Inspect</button>
          {source ? <a href={source} target="_blank" rel="noreferrer" title="Open Meta source" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><ExternalLink size={15} /></a> : null}
        </div>
      </div>
    </article>
  );
}


