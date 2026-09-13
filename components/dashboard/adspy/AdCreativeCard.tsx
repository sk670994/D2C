/* eslint-disable @next/next/no-img-element */

"use client";

import {
  ExternalLink,
  Image as ImageIcon,
  Layers3,
  Play,
  Sparkles,
  UserRound,
  Video,
} from "lucide-react";

import {
  useState,
} from "react";

import type {
  Ad,
} from "./adspy-types";

function safeUrl(
  value?:
    | string
    | null,
) {
  if (!value) {
    return null;
  }

  try {
    const url =
      new URL(value);

    if (
      url.protocol !==
        "http:" &&
      url.protocol !==
        "https:"
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function formatDate(
  value?:
    | string
    | null,
): string {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  );
}

function formatCreativeType(
  ad: Ad,
): string {
  if (
    ad.creativeType ===
      "video" ||
    ad.videoUrl
  ) {
    return "Video";
  }

  if (
    ad.creativeType ===
    "carousel"
  ) {
    return "Carousel";
  }

  return "Image";
}

function cleanText(
  value?:
    | string
    | null,
): string {
  return String(
    value ?? "",
  )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function truncate(
  value?:
    | string
    | null,
  length = 150,
): string {
  const text =
    cleanText(value);

  if (!text) {
    return "No primary copy captured from the public source.";
  }

  return text.length >
    length
    ? `${text
        .slice(
          0,
          length,
        )
        .trim()}…`
    : text;
}

export function AdCreativeCard({
  ad,
  onOpen,
}: {
  ad: Ad;

  onOpen: (
    ad: Ad,
  ) => void;
}) {
  const [
    playing,
    setPlaying,
  ] =
    useState(false);

  const image =
    safeUrl(
      ad.thumbnailUrl ??
        ad.imageUrl,
    );

  const video =
    safeUrl(
      ad.videoUrl,
    );

  const source =
    safeUrl(
      ad.sourceUrl,
    );

  const landing =
    safeUrl(
      ad.landingPage,
    );

  const type =
    formatCreativeType(
      ad,
    );

  const active =
    ad.isActive !==
    false;

  return (
    <article className="group overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_5px_20px_rgba(15,23,42,0.045)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
      <button
        type="button"
        onClick={() =>
          onOpen(ad)
        }
        aria-label={`Open ${
          ad.headline ||
          ad.advertiserName ||
          "creative"
        } details`}
        className="block w-full text-left"
      >
        <div className="relative aspect-[1.1/1] overflow-hidden bg-slate-100">
          {playing &&
          video ? (
            <video
              src={video}
              poster={
                image ??
                undefined
              }
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
              onEnded={() =>
                setPlaying(
                  false,
                )
              }
            />
          ) : image ? (
            <img
              src={image}
              alt={
                ad.headline ||
                ad.advertiserName ||
                "Ad creative"
              }
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
              <ImageIcon
                size={30}
              />

              <span className="text-xs">
                Media unavailable
              </span>
            </div>
          )}

          <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
            <span
              className={
                active
                  ? "rounded-full bg-slate-950/75 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur"
                  : "rounded-full bg-slate-800/75 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-200 backdrop-blur"
              }
            >
              {active
                ? "Active"
                : "Inactive"}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-950/70 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur">
              {type ===
              "Video" ? (
                <Video
                  size={10}
                />
              ) : type ===
                "Carousel" ? (
                <Layers3
                  size={10}
                />
              ) : (
                <ImageIcon
                  size={10}
                />
              )}

              {type}
            </span>
          </div>

          {video &&
          !playing ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Play video preview"
              className="absolute bottom-3 left-3 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-950 shadow-lg transition group-hover:scale-105"
              onClick={(
                event,
              ) => {
                event.stopPropagation();
                setPlaying(
                  true,
                );
              }}
              onKeyDown={(
                event,
              ) => {
                if (
                  event.key ===
                    "Enter" ||
                  event.key ===
                    " "
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  setPlaying(
                    true,
                  );
                }
              }}
            >
              <Play
                size={13}
                fill="currentColor"
              />
            </span>
          ) : null}
        </div>
      </button>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
              {ad.advertiserName ||
                "Unknown advertiser"}
            </div>

            <h3 className="mt-1 line-clamp-2 text-[14px] font-bold leading-5 text-slate-950">
              {ad.headline ||
                ad.productName ||
                "Untitled creative"}
            </h3>
          </div>

          {ad.runningDays ? (
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-500">
              {ad.runningDays}d
            </span>
          ) : null}
        </div>

        <p className="mt-2.5 line-clamp-2 text-[12px] leading-5 text-slate-600">
          {truncate(
            ad.primaryText ??
              ad.description,
          )}
        </p>

        <div className="mt-3 flex items-center gap-1.5 overflow-hidden">
          {ad.creatorName ? (
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[9px] font-semibold text-slate-500">
              <UserRound
                size={9}
              />

              <span className="truncate">
                {
                  ad.creatorName
                }
              </span>
            </span>
          ) : null}

          {ad.callToAction ? (
            <span className="truncate rounded-full bg-slate-50 px-2 py-1 text-[9px] font-semibold text-slate-500">
              {ad.callToAction}
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-slate-400">
              First seen
            </div>

            <div className="mt-0.5 text-[10px] font-semibold text-slate-700">
              {formatDate(
                ad.firstSeen,
              )}
            </div>
          </div>

          <div>
            <div className="text-[9px] uppercase tracking-wide text-slate-400">
              Platform
            </div>

            <div className="mt-0.5 truncate text-[10px] font-semibold capitalize text-slate-700">
              {ad.platform}
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() =>
              onOpen(ad)
            }
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-[11px] font-bold text-white transition hover:bg-slate-800"
          >
            <Sparkles
              size={12}
            />

            Inspect
          </button>

          {landing ? (
            <a
              href={landing}
              target="_blank"
              rel="noreferrer"
              onClick={(
                event,
              ) =>
                event.stopPropagation()
              }
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              title="Open landing page"
              aria-label="Open landing page"
            >
              <ExternalLink
                size={13}
              />
            </a>
          ) : null}

          {source ? (
            <a
              href={source}
              target="_blank"
              rel="noreferrer"
              onClick={(
                event,
              ) =>
                event.stopPropagation()
              }
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              title="Open public ad source"
              aria-label="Open public ad source"
            >
              <ExternalLink
                size={13}
              />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}