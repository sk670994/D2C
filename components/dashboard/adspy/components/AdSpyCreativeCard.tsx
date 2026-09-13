/* eslint-disable @next/next/no-img-element */

"use client";

import { ExternalLink, Image as ImageIcon, Layers3, Sparkles, Video } from "lucide-react";
import type { Ad } from "../adspy-types";

function safeUrl(value?: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function mediaProxy(value: string) {
  return `/api/ad-intelligence/media?url=${encodeURIComponent(value)}`;
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function cleanText(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function AdSpyCreativeCard({
  ad,
  onInspect,
}: {
  ad: Ad;
  onInspect: () => void;
}) {
  const image = safeUrl(ad.thumbnailUrl || ad.imageUrl);
  const video = safeUrl(ad.videoUrl);
  const source = safeUrl(ad.sourceUrl);
  const type = ad.creativeType || (video ? "video" : "image");
  const active = ad.isActive !== false;
  const copy = cleanText(ad.primaryText || ad.description) || "No public copy captured.";

  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const current = event.currentTarget;
    if (!current.dataset.proxyTried && image) {
      current.dataset.proxyTried = "1";
      current.src = mediaProxy(image);
    }
  };

  return (
    <article
      data-adspy-creative
      data-adspy-framework="static-creative-surface"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a, video, input, textarea, select")) return;
        onInspect();
      }}
      className="group h-full cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_5px_20px_rgba(15,23,42,.045)] transition-shadow duration-200 hover:shadow-[0_14px_34px_rgba(15,23,42,.09)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {image ? (
          <img
            src={image}
            alt={ad.headline || ad.productName || ad.advertiserName || "Ad creative"}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-slate-400">
            <ImageIcon size={28} />
          </div>
        )}

        <div className="absolute inset-x-2.5 top-2.5 z-10 flex items-center justify-between gap-2">
          <span className="rounded-full bg-white/95 px-2 py-1 text-[9px] font-bold text-slate-700 shadow-sm">
            {active ? "Active" : "Inactive"}
          </span>

          <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/78 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white">
            {type === "video" ? <Video size={10} /> : type === "carousel" ? <Layers3 size={10} /> : <ImageIcon size={10} />}
            {type}
          </span>
        </div>

        {video ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onInspect();
            }}
            aria-label="Open creative with video"
            title="Open creative"
            className="absolute bottom-2.5 left-2.5 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/75 bg-white text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,.2)] transition hover:scale-105"
          >
            <img src="/adspy/icons/play.svg" alt="" width="16" height="16" />
          </button>
        ) : null}
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
              {ad.advertiserName || "Unknown advertiser"}
            </div>

            <h3 className="mt-0.5 text-sm font-bold leading-5 text-slate-950">
              {ad.headline || ad.productName || "Untitled creative"}
            </h3>
          </div>

          {ad.runningDays != null ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-1 text-[9px] font-bold text-slate-500">
              {ad.runningDays}d
            </span>
          ) : null}
        </div>

        <p className="mt-2.5 text-[10px] leading-4.5 text-slate-600">
          {copy}
        </p>

        <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-[9px]">
          <div>
            <div className="text-slate-400">First seen</div>
            <div className="mt-0.5 truncate font-semibold text-slate-800">
              {dateLabel(ad.firstSeen)}
            </div>
          </div>

          <div>
            <div className="text-slate-400">CTA</div>
            <div className="mt-0.5 truncate font-semibold text-slate-800">
              {ad.callToAction || "—"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onInspect();
          }}
          className="mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-2 text-[10px] font-bold text-white transition hover:bg-slate-800"
        >
          <Sparkles size={12} />
          Inspect all details
        </button>

        {source ? (
          <a
            href={source}
            target="_blank"
            rel="noreferrer"
            title="Open source"
            onClick={(event) => event.stopPropagation()}
            className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 py-1 text-[9px] font-semibold text-slate-400 hover:text-slate-800"
          >
            <ExternalLink size={11} />
            Open source
          </a>
        ) : null}
      </div>
    </article>
  );
}
