/* eslint-disable @next/next/no-img-element */

"use client";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Image as ImageIcon,
  Layers3,
  Link2,
  MapPin,
  MessageSquareText,
  Package,
  Play,
  ShieldCheck,
  Tag,
  Target,
  UserRound,
  Video,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  Ad,
} from "../adspy-types";

type CreativeVersion = {
  version_id: string;
  creative_id: string;
  content_hash: string;

  advertiser_name: string | null;
  advertiser_id: string | null;

  creator_name: string | null;
  partnership_type: string | null;

  creative_type: string | null;

  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;

  primary_text: string | null;
  headline: string | null;
  description: string | null;
  call_to_action: string | null;

  landing_page_url: string | null;
  source_url: string | null;

  product_name: string | null;
  product_price: number | null;
  max_price: number | null;
  currency: string | null;

  offer: string | null;
  transcript: string | null;

  is_currently_active: boolean | null;

  first_observed_at: string | null;
  last_observed_at: string | null;

  seen_count: number;
};

function safeUrl(
  value?: string | null,
) {
  if (!value) {
    return null;
  }

  try {
    const url =
      new URL(value);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function dateLabel(
  value?: string | null,
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

function dateTimeLabel(
  value?: string | null,
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

  return date.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function safeText(
  value?: string | number | null,
) {
  if (
    value == null ||
    String(value).trim() === ""
  ) {
    return "—";
  }

  return String(value);
}

function Detail({
  label,
  value,
  icon,
  mono = false,
}: {
  label: string;
  value?: string | number | null;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {icon}
        {label}
      </div>

      <div
        className={[
          "mt-1.5 break-words text-xs font-semibold leading-5 text-slate-800",
          mono
            ? "font-mono text-[11px]"
            : "",
        ].join(" ")}
      >
        {safeText(value)}
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  eyebrow,
  title,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-950 text-white">
        {icon}
      </span>

      <div>
        <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-400">
          {eyebrow}
        </div>

        <h3 className="text-sm font-bold text-slate-950">
          {title}
        </h3>
      </div>
    </div>
  );
}

function normalize(
  value?: string | null,
) {
  return String(
    value ?? "",
  )
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function detectMessaging(
  ad: Ad,
) {
  const text =
    [
      ad.primaryText,
      ad.headline,
      ad.offer,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  if (!text) {
    return "Not enough copy captured";
  }

  const rules = [
    {
      label: "Discount-led",
      terms: [
        "discount",
        "off",
        "sale",
        "save",
        "deal",
        "%",
        "coupon",
      ],
    },
    {
      label: "Problem-solution",
      terms: [
        "problem",
        "solve",
        "fix",
        "struggle",
        "pain",
        "without",
      ],
    },
    {
      label: "Benefit-led",
      terms: [
        "benefit",
        "better",
        "faster",
        "easier",
        "quality",
        "results",
        "glow",
      ],
    },
    {
      label: "Social-proof",
      terms: [
        "review",
        "reviews",
        "customer",
        "customers",
        "trusted",
        "testimonial",
        "loved",
      ],
    },
    {
      label: "Urgency-led",
      terms: [
        "today",
        "now",
        "limited",
        "hurry",
        "ends",
        "last",
        "only",
      ],
    },
  ];

  let winner =
    "General product messaging";
  let winnerScore = 0;

  for (const rule of rules) {
    let score = 0;

    for (const term of rule.terms) {
      if (text.includes(term)) {
        score += 1;
      }
    }

    if (score > winnerScore) {
      winnerScore = score;
      winner = rule.label;
    }
  }

  return winner;
}

function detectHook(
  ad: Ad,
) {
  const text =
    String(
      ad.primaryText ||
        ad.headline ||
        "",
    )
      .replace(/\s+/g, " ")
      .trim();

  if (!text) {
    return "Not enough copy captured";
  }

  const first =
    text.split(
      /[.!?।！？]/,
    )[0] || text;

  if (
    /\?/.test(first)
  ) {
    return "Question / curiosity";
  }

  if (
    /^(stop|don't|never|avoid|warning)\b/i.test(
      first,
    )
  ) {
    return "Pattern interrupt";
  }

  if (
    /(\d+%|\d+\s*(days|day|hrs|hours|minutes))/i.test(
      first,
    )
  ) {
    return "Specific result / timeframe";
  }

  if (
    /^(how|why|what|discover|meet|see)\b/i.test(
      first,
    )
  ) {
    return "Curiosity / discovery";
  }

  return "Direct product statement";
}

function getVersionChanges(
  current: Ad,
  previous: CreativeVersion,
) {
  const changes: string[] = [];

  if (
    normalize(
      previous.primary_text,
    ) !==
    normalize(
      current.primaryText,
    )
  ) {
    changes.push(
      "Primary text changed",
    );
  }

  if (
    normalize(
      previous.headline,
    ) !==
    normalize(
      current.headline,
    )
  ) {
    changes.push(
      "Headline changed",
    );
  }

  if (
    normalize(
      previous.description,
    ) !==
    normalize(
      current.description,
    )
  ) {
    changes.push(
      "Description changed",
    );
  }

  if (
    normalize(
      previous.call_to_action,
    ) !==
    normalize(
      current.callToAction,
    )
  ) {
    changes.push(
      "CTA changed",
    );
  }

  if (
    normalize(
      previous.offer,
    ) !==
    normalize(
      current.offer,
    )
  ) {
    changes.push(
      "Offer changed",
    );
  }

  if (
    normalize(
      previous.product_name,
    ) !==
    normalize(
      current.productName,
    )
  ) {
    changes.push(
      "Product changed",
    );
  }

  if (
    normalize(
      previous.creative_type,
    ) !==
    normalize(
      current.creativeType,
    )
  ) {
    changes.push(
      "Format changed",
    );
  }

  return changes;
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

  const hook =
    useMemo(
      () =>
        detectHook(ad),
      [ad],
    );

  const messaging =
    useMemo(
      () =>
        detectMessaging(ad),
      [ad],
    );

  const [
    versions,
    setVersions,
  ] =
    useState<CreativeVersion[]>(
      [],
    );

  const [
    historyLoading,
    setHistoryLoading,
  ] = useState(false);

  const [
    historyError,
    setHistoryError,
  ] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (
        !ad.id ||
        !ad.advertiserName
      ) {
        return;
      }

      setHistoryLoading(true);
      setHistoryError("");

      try {
        const params =
          new URLSearchParams({
            q:
              ad.advertiserName,
            country:
              ad.country ||
              "IN",
            platform:
              ad.platform,
            mode:
              "advertiser",
            limit: "300",
          });

        const response =
          await fetch(
            `/api/ad-intelligence/history?${params.toString()}`,
            {
              cache:
                "no-store",
            },
          );

        if (
          !response.ok
        ) {
          throw new Error(
            "Unable to load creative history.",
          );
        }

        const data =
          await response.json();

        const all =
          Array.isArray(
            data?.versions,
          )
            ? data.versions
            : Array.isArray(
                data?.history,
              )
              ? data.history
              : [];

        const matching =
          all
            .filter(
              (
                item: CreativeVersion,
              ) =>
                item.creative_id ===
                ad.id,
            )
            .sort(
              (
                a: CreativeVersion,
                b: CreativeVersion,
              ) => {
                const aTime =
                  new Date(
                    a.first_observed_at ||
                      0,
                  ).getTime();

                const bTime =
                  new Date(
                    b.first_observed_at ||
                      0,
                  ).getTime();

                return (
                  bTime -
                  aTime
                );
              },
            );

        if (!cancelled) {
          setVersions(
            matching,
          );
        }
      } catch (
        error
      ) {
        if (
          !cancelled
        ) {
          setHistoryError(
            error instanceof
              Error
              ? error.message
              : "Unable to load creative history.",
          );
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(
            false,
          );
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [
    ad.id,
    ad.advertiserName,
    ad.country,
    ad.platform,
  ]);

  const latestVersion =
    versions[0] ??
    null;

  const previousVersion =
    versions.length > 1
      ? versions[1]
      : null;

  const changes =
    latestVersion &&
    previousVersion
      ? getVersionChanges(
          ad,
          previousVersion,
        )
      : [];

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
        className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-md sm:p-5"
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
            y: 20,
            scale: 0.985,
          }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          exit={{
            opacity: 0,
            y: 16,
            scale: 0.985,
          }}
          transition={{
            duration: 0.26,
            ease: [
              0.16,
              1,
              0.3,
              1,
            ],
          }}
          className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.32)]"
        >
          {/* HEADER */}
          <header className="flex shrink-0 items-start justify-between gap-5 border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Creative intelligence
                </span>

                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[8px] font-bold capitalize text-blue-700">
                  {type}
                </span>

                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[8px] font-bold text-slate-600">
                  {ad.platform}
                </span>

                {ad.isActive !==
                false ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-2.5 py-1 text-[8px] font-bold text-white">
                    <CheckCircle2
                      size={10}
                    />
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[8px] font-bold text-slate-500">
                    Inactive
                  </span>
                )}
              </div>

              <h2 className="mt-2 max-w-3xl text-lg font-bold tracking-tight text-slate-950 sm:text-2xl">
                {ad.headline ||
                  ad.productName ||
                  "Untitled creative"}
              </h2>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span>
                  {ad.advertiserName ||
                    "Unknown advertiser"}
                </span>

                {ad.creatorName ? (
                  <>
                    <span>
                      ·
                    </span>

                    <span>
                      {ad.creatorName}
                    </span>
                  </>
                ) : null}
              </div>
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
          </header>

          {/* BODY */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              {/* LEFT */}
              <main className="space-y-5 border-b border-slate-100 bg-slate-50/70 p-4 sm:p-6 lg:border-b-0 lg:border-r">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="relative flex min-h-[340px] items-center justify-center bg-slate-100">
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
                      <div className="text-center text-xs text-slate-400">
                        <ImageIcon
                          size={36}
                          className="mx-auto mb-2"
                        />

                        Media unavailable
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-between">
                      <span className="rounded-full bg-slate-950/75 px-2.5 py-1 text-[8px] font-bold uppercase tracking-wide text-white backdrop-blur">
                        {type}
                      </span>

                      {ad.runningDays ? (
                        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[8px] font-bold text-slate-700 shadow-sm backdrop-blur">
                          {ad.runningDays}d observed
                        </span>
                      ) : null}
                    </div>
                  </div>
                </section>

                {/* CREATIVE DNA */}
                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <SectionTitle
                    icon={
                      <Target
                        size={13}
                      />
                    }
                    eyebrow="Creative DNA"
                    title="What this creative is communicating"
                  />

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Detail
                      label="Hook"
                      value={hook}
                    />

                    <Detail
                      label="Messaging"
                      value={messaging}
                    />

                    <Detail
                      label="CTA"
                      value={
                        ad.callToAction
                      }
                    />
                  </div>
                </section>

                {/* PRIMARY COPY */}
                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <SectionTitle
                    icon={
                      <MessageSquareText
                        size={13}
                      />
                    }
                    eyebrow="Copy"
                    title="Primary text"
                  />

                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {ad.primaryText ||
                      "No public copy captured."}
                  </p>

                  {ad.headline ? (
                    <div className="mt-4 rounded-xl bg-slate-50 p-3">
                      <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Headline
                      </div>

                      <div className="mt-1 text-sm font-semibold leading-5 text-slate-900">
                        {ad.headline}
                      </div>
                    </div>
                  ) : null}

                  {ad.description ? (
                    <div className="mt-2 rounded-xl bg-slate-50 p-3">
                      <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Description
                      </div>

                      <div className="mt-1 text-xs leading-5 text-slate-600">
                        {ad.description}
                      </div>
                    </div>
                  ) : null}
                </section>

                {/* TRANSCRIPT */}
                {ad.transcript ? (
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                    <SectionTitle
                      icon={
                        <Video
                          size={13}
                        />
                      }
                      eyebrow="Video intelligence"
                      title="Transcript"
                    />

                    <p className="whitespace-pre-wrap text-xs leading-5 text-slate-600">
                      {ad.transcript}
                    </p>

                    {ad.transcriptStatus ? (
                      <div className="mt-3 text-[9px] font-medium text-slate-400">
                        Status:{" "}
                        {
                          ad.transcriptStatus
                        }
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </main>

              {/* RIGHT */}
              <aside className="min-h-0 space-y-5 p-4 sm:p-5 lg:p-6">
                {/* SNAPSHOT */}
                <section>
                  <SectionTitle
                    icon={
                      <Activity
                        size={13}
                      />
                    }
                    eyebrow="Observed data"
                    title="Creative snapshot"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <Detail
                      label="First seen"
                      value={dateLabel(
                        ad.firstSeen,
                      )}
                      icon={
                        <CalendarDays
                          size={10}
                        />
                      }
                    />

                    <Detail
                      label="Last seen"
                      value={dateLabel(
                        ad.lastSeen,
                      )}
                      icon={
                        <CalendarDays
                          size={10}
                        />
                      }
                    />

                    <Detail
                      label="Observed run"
                      value={
                        ad.runningDays
                          ? `${ad.runningDays} days`
                          : null
                      }
                      icon={
                        <Clock3
                          size={10}
                        />
                      }
                    />

                    <Detail
                      label="Format"
                      value={type}
                      icon={
                        type ===
                        "video" ? (
                          <Video
                            size={10}
                          />
                        ) : (
                          <ImageIcon
                            size={10}
                          />
                        )
                      }
                    />
                  </div>
                </section>

                {/* IDENTITY */}
                <section>
                  <SectionTitle
                    icon={
                      <UserRound
                        size={13}
                      />
                    }
                    eyebrow="Identity"
                    title="Advertiser & creator"
                  />

                  <div className="grid gap-2">
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
                      mono
                    />

                    <div className="grid grid-cols-2 gap-2">
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
                    </div>
                  </div>
                </section>

                {/* OFFER */}
                <section>
                  <SectionTitle
                    icon={
                      <Package
                        size={13}
                      />
                    }
                    eyebrow="Commercial"
                    title="Offer & product"
                  />

                  <div className="grid gap-2">
                    <Detail
                      label="Offer"
                      value={
                        ad.offer
                      }
                      icon={
                        <Tag
                          size={10}
                        />
                      }
                    />

                    <Detail
                      label="Product"
                      value={
                        ad.productName
                      }
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <Detail
                        label="Price"
                        value={
                          ad.productPrice !=
                          null
                            ? `${ad.productPrice}${ad.currency ? ` ${ad.currency}` : ""}`
                            : null
                        }
                      />

                      <Detail
                        label="Max price"
                        value={
                          ad.maxPrice !=
                          null
                            ? `${ad.maxPrice}${ad.currency ? ` ${ad.currency}` : ""}`
                            : null
                        }
                      />
                    </div>
                  </div>
                </section>

                {/* DISTRIBUTION */}
                <section>
                  <SectionTitle
                    icon={
                      <Layers3
                        size={13}
                      />
                    }
                    eyebrow="Distribution"
                    title="Where it appears"
                  />

                  <div className="grid gap-2">
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
                      icon={
                        <MapPin
                          size={10}
                        />
                      }
                    />

                    <Detail
                      label="Publisher platforms"
                      value={
                        ad
                          .publisherPlatforms
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
                        ad.languages
                          ?.length
                          ? ad.languages
                              .map(
                                (
                                  item,
                                ) =>
                                  item.name,
                              )
                              .join(
                                " · ",
                              )
                          : "Not captured"
                      }
                    />
                  </div>
                </section>

                {/* MARKETS */}
                {ad.markets?.length ? (
                  <section>
                    <SectionTitle
                      icon={
                        <MapPin
                          size={13}
                        />
                      }
                      eyebrow="Market footprint"
                      title="Observed markets"
                    />

                    <div className="space-y-2">
                      {ad.markets
                        .slice(
                          0,
                          8,
                        )
                        .map(
                          (
                            market,
                            index,
                          ) => (
                            <div
                              key={`${market.countryCode ?? "market"}-${index}`}
                              className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs font-semibold text-slate-800">
                                  {market.countryName ||
                                    market.countryCode ||
                                    "Market"}
                                </div>

                                <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-400">
                                  {
                                    market.source
                                  }
                                </span>
                              </div>

                              <div className="mt-1 text-[10px] text-slate-500">
                                {[
                                  market.stateName,
                                  market.cityName,
                                  market.regionName,
                                ]
                                  .filter(
                                    Boolean,
                                  )
                                  .join(
                                    " · ",
                                  ) ||
                                  "Location detail not captured"}
                              </div>
                            </div>
                          ),
                        )}
                    </div>
                  </section>
                ) : null}

                {/* HISTORY */}
                <section>
                  <SectionTitle
                    icon={
                      <History
                        size={13}
                      />
                    }
                    eyebrow="Historical intelligence"
                    title="Creative evolution"
                  />

                  {historyLoading ? (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-700" />
                        Loading version history…
                      </div>

                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <motion.div
                          className="h-full w-1/3 rounded-full bg-slate-700"
                          animate={{
                            x: [
                              "-120%",
                              "320%",
                            ],
                          }}
                          transition={{
                            duration: 1.5,
                            repeat:
                              Infinity,
                            ease: "easeInOut",
                          }}
                        />
                      </div>
                    </div>
                  ) : historyError ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-xs leading-5 text-slate-500">
                      {historyError}
                    </div>
                  ) : versions.length ? (
                    <div className="space-y-2">
                      <div className="rounded-2xl bg-slate-950 p-4 text-white">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400">
                              Versions captured
                            </div>

                            <div className="mt-1 text-xl font-bold">
                              {
                                versions.length
                              }
                            </div>
                          </div>

                          <History
                            size={18}
                            className="text-slate-400"
                          />
                        </div>

                        <div className="mt-3 text-[10px] leading-4 text-slate-400">
                          Historical snapshots available for this exact creative.
                        </div>
                      </div>

                      {changes.length ? (
                        <div className="rounded-2xl border border-slate-200 p-4">
                          <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400">
                            Latest observed changes
                          </div>

                          <div className="mt-2 space-y-1.5">
                            {changes.map(
                              (
                                change,
                              ) => (
                                <div
                                  key={
                                    change
                                  }
                                  className="flex items-center gap-2 text-xs font-medium text-slate-700"
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                                  {
                                    change
                                  }
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        {versions
                          .slice(
                            0,
                            5,
                          )
                          .map(
                            (
                              version,
                              index,
                            ) => (
                              <div
                                key={
                                  version.version_id
                                }
                                className="relative rounded-2xl border border-slate-100 bg-slate-50/70 p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-xs font-semibold text-slate-800">
                                      {index ===
                                      0
                                        ? "Current observed version"
                                        : `Version ${versions.length - index}`}
                                    </div>

                                    <div className="mt-0.5 text-[9px] text-slate-400">
                                      {
                                        dateTimeLabel(
                                          version.first_observed_at,
                                        )
                                      }
                                    </div>
                                  </div>

                                  <span className="rounded-full bg-white px-2 py-1 text-[8px] font-bold text-slate-500">
                                    {
                                      version.seen_count
                                    }{" "}
                                    observations
                                  </span>
                                </div>

                                {version.headline ? (
                                  <div className="mt-2 text-[11px] font-semibold text-slate-700">
                                    {
                                      version.headline
                                    }
                                  </div>
                                ) : null}

                                {version.primary_text ? (
                                  <div className="mt-1 line-clamp-3 text-[10px] leading-4 text-slate-500">
                                    {
                                      version.primary_text
                                    }
                                  </div>
                                ) : null}
                              </div>
                            ),
                          )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-4">
                      <div className="text-xs font-semibold text-slate-700">
                        No historical version captured yet.
                      </div>

                      <div className="mt-1 text-[10px] leading-4 text-slate-400">
                        History starts accumulating as this creative is observed and changes over time.
                      </div>
                    </div>
                  )}
                </section>

                {/* SOURCE */}
                {source ||
                landing ? (
                  <section>
                    <SectionTitle
                      icon={
                        <Link2
                          size={13}
                        />
                      }
                      eyebrow="Source"
                      title="Public references"
                    />

                    <div className="space-y-2">
                      {source ? (
                        <a
                          href={
                            source
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <span className="flex items-center gap-2">
                            <ExternalLink
                              size={12}
                            />
                            Public ad source
                          </span>

                          <span className="text-[9px] text-slate-400">
                            Open
                          </span>
                        </a>
                      ) : null}

                      {landing ? (
                        <a
                          href={
                            landing
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <span className="flex items-center gap-2">
                            <ExternalLink
                              size={12}
                            />
                            Landing page
                          </span>

                          <span className="text-[9px] text-slate-400">
                            Open
                          </span>
                        </a>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {/* PROVENANCE */}
                <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck
                      size={14}
                      className="text-slate-600"
                    />

                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Data provenance
                    </div>
                  </div>

                  <p className="mt-2 text-[10px] leading-4 text-slate-500">
                    This inspector displays publicly observed creative data. Missing fields remain unknown rather than being inferred as facts.
                  </p>

                  <div className="mt-3 text-[9px] text-slate-400">
                    Observed latest:{" "}
                    {dateTimeLabel(
                      ad.lastSeen,
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}