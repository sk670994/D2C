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
      className="group relative h-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_5px_20px_rgba(15,23,42,.045)]"
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

        {/* Minimal visual metadata: icons only. All creative text lives in Inspect. */}
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-10 flex items-center justify-between">
          <span
            title={active ? "Active creative" : "Inactive creative"}
            aria-label={active ? "Active creative" : "Inactive creative"}
            className={`grid h-7 w-7 place-items-center rounded-lg border shadow-sm backdrop-blur ${
              active
                ? "border-white/70 bg-white/90 text-blue-600"
                : "border-white/60 bg-slate-800/80 text-white"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${active ? "bg-blue-600" : "bg-slate-300"}`} />
          </span>

          <span
            title={`${type} creative`}
            aria-label={`${type} creative`}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/60 bg-slate-950/80 text-white shadow-sm backdrop-blur"
          >
            {type === "video" ? (
              <Video size={12} />
            ) : type === "carousel" ? (
              <Layers3 size={12} />
            ) : (
              <ImageIcon size={12} />
            )}
          </span>
        </div>

        <div className="absolute inset-x-2.5 bottom-2.5 z-10 flex items-center justify-between">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onInspect();
            }}
            aria-label="Inspect creative"
            title="Inspect creative"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/70 bg-white text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,.18)]"
          >
            <Sparkles size={14} />
          </button>

          <div className="flex items-center gap-1.5">
            {video ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onInspect();
                }}
                aria-label="Open video creative"
                title="Open video creative"
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/60 bg-slate-950/85 text-white shadow-sm"
              >
                <img src="/adspy/icons/play.svg" alt="" width="14" height="14" />
              </button>
            ) : null}

            {source ? (
              <a
                href={source}
                target="_blank"
                rel="noreferrer"
                aria-label="Open public source"
                title="Open public source"
                onClick={(event) => event.stopPropagation()}
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/70 bg-white text-slate-950 shadow-sm"
              >
                <ExternalLink size={13} />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
