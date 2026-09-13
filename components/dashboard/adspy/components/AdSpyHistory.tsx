"use client";

import {
  ArrowRight,
  CalendarDays,
  GitCompareArrows,
  History,
  Minus,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Platform =
  | "meta"
  | "google"
  | "linkedin";

type HistoryVersion = {
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

  first_observed_at: string;
  last_observed_at: string;

  seen_count: number;
};

type Change = {
  label: string;
  before: string;
  after: string;
};

function value(
  input: string | null | undefined,
) {
  const result = String(
    input ?? "",
  )
    .replace(/\s+/g, " ")
    .trim();

  return result || "Not captured";
}

function dateLabel(
  input: string,
) {
  const date = new Date(input);

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

function truncate(
  input: string,
  length = 180,
) {
  if (input.length <= length) {
    return input;
  }

  return `${input.slice(
    0,
    length,
  )}…`;
}

function compareVersions(
  before: HistoryVersion,
  after: HistoryVersion,
): Change[] {
  const fields: Array<
    [
      string,
      string,
      string,
    ]
  > = [
    [
      "Primary text",
      value(before.primary_text),
      value(after.primary_text),
    ],
    [
      "Headline",
      value(before.headline),
      value(after.headline),
    ],
    [
      "Description",
      value(before.description),
      value(after.description),
    ],
    [
      "Offer",
      value(before.offer),
      value(after.offer),
    ],
    [
      "CTA",
      value(before.call_to_action),
      value(after.call_to_action),
    ],
    [
      "Product",
      value(before.product_name),
      value(after.product_name),
    ],
    [
      "Creative type",
      value(before.creative_type),
      value(after.creative_type),
    ],
    [
      "Image",
      value(before.image_url),
      value(after.image_url),
    ],
    [
      "Video",
      value(before.video_url),
      value(after.video_url),
    ],
  ];

  return fields
    .filter(
      ([, beforeValue, afterValue]) =>
        beforeValue !==
        afterValue,
    )
    .map(
      ([
        label,
        beforeValue,
        afterValue,
      ]) => ({
        label,
        before: beforeValue,
        after: afterValue,
      }),
    );
}

export function AdSpyHistory({
  query,
  country,
  platform,
}: {
  query: string;
  country: string;
  platform: Platform;
}) {
  const [
    versions,
    setVersions,
  ] = useState<
    HistoryVersion[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    const normalizedQuery =
      query.trim();

    if (
      normalizedQuery.length < 2
    ) {
      return;
    }

    const controller =
      new AbortController();

    let active = true;

    const load =
      async () => {
        setLoading(true);
        setError("");

        try {
          const url =
            new URL(
              "/api/ad-intelligence/history",
              window.location.origin,
            );

          url.searchParams.set(
            "q",
            normalizedQuery,
          );

          url.searchParams.set(
            "country",
            country,
          );

          url.searchParams.set(
            "platform",
            platform,
          );

          url.searchParams.set(
            "mode",
            "advertiser",
          );

          url.searchParams.set(
            "limit",
            "300",
          );

          const response =
            await fetch(
              url,
              {
                cache:
                  "no-store",
                signal:
                  controller.signal,
              },
            );

          const data =
            await response.json();

          if (
            !response.ok ||
            !data?.success
          ) {
            throw new Error(
              data?.error ??
                "Failed to load history.",
            );
          }

          if (active) {
            setVersions(
              Array.isArray(
                data.versions,
              )
                ? data.versions
                : [],
            );
          }
        } catch (
          requestError
        ) {
          if (
            !active ||
            (
              requestError instanceof
                DOMException &&
              requestError.name ===
                "AbortError"
            )
          ) {
            return;
          }

          setError(
            requestError instanceof
              Error
              ? requestError.message
              : "Failed to load history.",
          );
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    query,
    country,
    platform,
  ]);

  const timelines =
    useMemo(() => {
      const grouped =
        new Map<
          string,
          HistoryVersion[]
        >();

      for (
        const version of versions
      ) {
        const existing =
          grouped.get(
            version.creative_id,
          ) ?? [];

        existing.push(
          version,
        );

        grouped.set(
          version.creative_id,
          existing,
        );
      }

      for (
        const items of grouped.values()
      ) {
        items.sort(
          (
            a,
            b,
          ) =>
            new Date(
              a.first_observed_at,
            ).getTime() -
            new Date(
              b.first_observed_at,
            ).getTime(),
        );
      }

      return Array.from(
        grouped.entries(),
      )
        .map(
          ([
            creativeId,
            items,
          ]) => ({
            creativeId,
            items,
          }),
        )
        .filter(
          ({ items }) =>
            items.length > 1,
        )
        .sort(
          (a, b) => {
            const aTime =
              new Date(
                a.items.at(-1)!
                  .last_observed_at,
              ).getTime();

            const bTime =
              new Date(
                b.items.at(-1)!
                  .last_observed_at,
              ).getTime();

            return bTime - aTime;
          },
        );
    }, [versions]);

  const changes =
    useMemo(() => {
      const output: Array<{
        creativeId: string;
        from: HistoryVersion;
        to: HistoryVersion;
        changes: Change[];
      }> = [];

      for (
        const timeline of timelines
      ) {
        const items =
          timeline.items;

        for (
          let index = 1;
          index < items.length;
          index += 1
        ) {
          const before =
            items[index - 1];

          const after =
            items[index];

          const diff =
            compareVersions(
              before,
              after,
            );

          if (diff.length) {
            output.push({
              creativeId:
                timeline.creativeId,
              from: before,
              to: after,
              changes: diff,
            });
          }
        }
      }

      return output.reverse();
    }, [timelines]);

  if (
    query.trim().length < 2
  ) {
    return null;
  }

  if (
    loading &&
    versions.length === 0
  ) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white">
            <History
              size={17}
              className="animate-pulse"
            />
          </div>

          <div>
            <div className="text-sm font-bold text-slate-900">
              Building creative history
            </div>

            <p className="mt-1 text-xs text-slate-500">
              Comparing captured versions of
              the advertiser&apos;s creatives.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <RefreshCcw size={16} />
          {error}
        </div>
      </section>
    );
  }

  if (
    versions.length === 0
  ) {
    return null;
  }

  return (
    <section className="space-y-5">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              <GitCompareArrows size={13} />
              Historical intelligence
            </div>

            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
              See what changed over time
            </h2>

            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Creative versions are reconstructed from
              observed changes in the indexed advertising
              footprint.
            </p>
          </div>

          <div className="text-xs text-slate-400">
            {versions.length} captured versions ·{" "}
            {changes.length} detected changes
          </div>
        </div>

        {changes.length ? (
          <div className="mt-6 space-y-4">
            {changes.slice(0, 10).map(
              (change) => (
                <article
                  key={`${change.creativeId}:${change.to.version_id}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm">
                        <CalendarDays size={11} />
                        {dateLabel(
                          change.to.first_observed_at,
                        )}
                      </span>

                      <ArrowRight
                        size={14}
                        className="text-slate-400"
                      />

                      <span className="text-xs font-semibold text-slate-800">
                        Creative changed
                      </span>
                    </div>

                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      {change.changes.length} signals
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {change.changes
                      .slice(0, 4)
                      .map(
                        (item) => (
                          <div
                            key={`${change.to.version_id}:${item.label}`}
                            className="rounded-xl border border-slate-200 bg-white p-3"
                          >
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              {item.label}
                            </div>

                            <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                              <div>
                                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                                  <Minus size={12} />
                                  Before
                                </div>

                                <p className="mt-1 text-xs leading-5 text-slate-600">
                                  {truncate(
                                    item.before,
                                  )}
                                </p>
                              </div>

                              <ArrowRight
                                size={14}
                                className="hidden text-slate-300 md:block"
                              />

                              <div>
                                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                                  <Plus size={12} />
                                  After
                                </div>

                                <p className="mt-1 text-xs leading-5 text-slate-900">
                                  {truncate(
                                    item.after,
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        ),
                      )}
                  </div>
                </article>
              ),
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <History
              size={20}
              className="mx-auto text-slate-400"
            />

            <div className="mt-3 text-sm font-semibold text-slate-800">
              No creative changes detected yet
            </div>

            <p className="mt-1 text-xs text-slate-500">
              Continue collecting this advertiser and
              Zooptrack will build the timeline automatically.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}