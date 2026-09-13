/* eslint-disable @next/next/no-img-element */

"use client";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

import {
  CalendarDays,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Layers3,
  MapPin,
  Tag,
  UserRound,
  X,
} from "lucide-react";

import type {
  Ad,
} from "../adspy-types";

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

function dateLabel(
  value?:
    | string
    | null,
) {
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
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  );
}

function Detail({
  label,
  value,
}: {
  label: string;

  value?:
    | string
    | number
    | null;
}) {
  const text =
    value == null ||
    String(
      value,
    ).trim() ===
      ""
      ? "—"
      : String(value);

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
        {label}
      </div>

      <div className="mt-1.5 wrap-break-word text-xs font-semibold leading-5 text-slate-800">
        {text}
      </div>
    </div>
  );
}

export function AdSpyCreativeModal({
  ad,
  onClose,
}: {
  ad: Ad;

  onClose: () => void;
}) {
  const media =
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
    ad.creativeType ||
    (video
      ? "video"
      : "image");

  return (
    <AnimatePresence>
      <motion.div
        initial={{
          opacity: 0,
        }}
        animate={{
          opacity: 1,
        }}
        exit={{
          opacity: 0,
        }}
        className="fixed inset-0 z-300 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:p-5"
        onMouseDown={(
          event,
        ) => {
          if (
            event.target ===
            event.currentTarget
          ) {
            onClose();
          }
        }}
      >
        <motion.div
          initial={{
            opacity: 0,
            y: 24,
            scale: 0.985,
          }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          exit={{
            opacity: 0,
            y: 18,
            scale: 0.985,
          }}
          transition={{
            duration: 0.28,
            ease: [
              0.16,
              1,
              0.3,
              1,
            ],
          }}
          className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.28)]"
        >
          <div className="flex shrink-0 items-start justify-between gap-5 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  Creative inspection
                </span>

                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-bold capitalize text-blue-600">
                  {type}
                </span>

                {ad.isActive !==
                false ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-700">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-500">
                    Inactive
                  </span>
                )}
              </div>

              <h2 className="mt-2 line-clamp-2 text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
                {ad.headline ||
                  ad.productName ||
                  "Untitled creative"}
              </h2>

              <p className="mt-1 text-xs font-medium text-slate-500">
                {ad.advertiserName ||
                  "Unknown advertiser"}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close creative inspector"
              title="Close"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <X
                size={16}
              />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_350px]">
            <div className="min-h-0 overflow-y-auto border-b border-slate-100 bg-slate-50 p-4 lg:border-b-0 lg:border-r sm:p-6">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {video ? (
                  <video
                    src={video}
                    poster={
                      media ??
                      undefined
                    }
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-[58vh] w-full object-contain"
                  />
                ) : media ? (
                  <img
                    src={media}
                    alt={
                      ad.headline ||
                      ad.productName ||
                      "Ad creative"
                    }
                    className="max-h-[58vh] w-full object-contain"
                  />
                ) : (
                  <div className="grid min-h-80 place-items-center text-sm text-slate-400">
                    <div className="text-center">
                      <ImageIcon
                        size={36}
                        className="mx-auto mb-2"
                      />

                      Media unavailable
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  <FileText
                    size={12}
                  />

                  Primary text
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {ad.primaryText ||
                    "No copy captured from the public source."}
                </p>
              </div>
            </div>

            <aside className="min-h-0 overflow-y-auto p-4 sm:p-5">
              <div className="space-y-5">
                <section>
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <UserRound
                      size={12}
                    />

                    Identity
                  </div>

                  <div className="mt-3 grid gap-2">
                    <Detail
                      label="Advertiser"
                      value={
                        ad.advertiserName
                      }
                    />

                    <Detail
                      label="Advertiser ID"
                      value={
                        ad.advertiserId
                      }
                    />

                    <Detail
                      label="Creator"
                      value={
                        ad.creatorName
                      }
                    />

                    <Detail
                      label="Partnership"
                      value={
                        ad.partnershipType
                      }
                    />

                    <Detail
                      label="Platform"
                      value={
                        ad.platform
                      }
                    />

                    <Detail
                      label="Country"
                      value={
                        ad.country
                      }
                    />
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <FileText
                      size={12}
                    />

                    Copy
                  </div>

                  <div className="mt-3 grid gap-2">
                    <Detail
                      label="Headline"
                      value={
                        ad.headline
                      }
                    />

                    <Detail
                      label="Description"
                      value={
                        ad.description
                      }
                    />

                    <Detail
                      label="Call to action"
                      value={
                        ad.callToAction
                      }
                    />
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <Tag
                      size={12}
                    />

                    Offer
                  </div>

                  <div className="mt-3 grid gap-2">
                    <Detail
                      label="Offer"
                      value={
                        ad.offer
                      }
                    />

                    <Detail
                      label="Product"
                      value={
                        ad.productName
                      }
                    />

                    <Detail
                      label="Price"
                      value={
                        ad.productPrice !=
                        null
                          ? `${ad.productPrice}${ad.currency ? ` ${ad.currency}` : ""}`
                          : null
                      }
                    />
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <CalendarDays
                      size={12}
                    />

                    Timeline
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Detail
                      label="First seen"
                      value={
                        dateLabel(
                          ad.firstSeen,
                        )
                      }
                    />

                    <Detail
                      label="Last seen"
                      value={
                        dateLabel(
                          ad.lastSeen,
                        )
                      }
                    />

                    <Detail
                      label="Observed run"
                      value={
                        ad.runningDays
                          ? `${ad.runningDays} days`
                          : "—"
                      }
                    />

                    <Detail
                      label="Status"
                      value={
                        ad.isActive ===
                        false
                          ? "Inactive"
                          : "Active"
                      }
                    />
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <Layers3
                      size={12}
                    />

                    Distribution
                  </div>

                  <div className="mt-3 grid gap-2">
                    <Detail
                      label="Publisher platforms"
                      value={
                        ad.publisherPlatforms
                          ?.length
                          ? ad.publisherPlatforms.join(
                              " · ",
                            )
                          : "Not captured"
                      }
                    />

                    <Detail
                      label="Languages"
                      value={
                        ad.languages?.length
                          ? ad.languages
                              .map(
                                (
                                  language,
                                ) =>
                                  language.name,
                              )
                              .join(
                                " · ",
                              )
                          : "Not captured"
                      }
                    />
                  </div>
                </section>

                {ad.markets?.length ? (
                  <section>
                    <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      <MapPin
                        size={12}
                      />

                      Markets
                    </div>

                    <div className="mt-3 grid gap-2">
                      {ad.markets
                        .slice(
                          0,
                          5,
                        )
                        .map(
                          (
                            market,
                            index,
                          ) => (
                            <Detail
                              key={`${market.countryCode ?? "market"}-${index}`}
                              label={
                                market.countryName ??
                                market.countryCode ??
                                "Market"
                              }
                              value={[
                                market.stateName,
                                market.cityName,
                                market.regionName,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  " · ",
                                )}
                            />
                          ),
                        )}
                    </div>
                  </section>
                ) : null}

                {source ||
                landing ? (
                  <section>
                    <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      <MapPin
                        size={12}
                      />

                      Source
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      {source ? (
                        <a
                          href={
                            source
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Public ad source

                          <ExternalLink
                            size={13}
                          />
                        </a>
                      ) : null}

                      {landing ? (
                        <a
                          href={
                            landing
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Landing page

                          <ExternalLink
                            size={13}
                          />
                        </a>
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </div>
            </aside>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}