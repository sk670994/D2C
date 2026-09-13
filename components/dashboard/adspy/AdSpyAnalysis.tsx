"use client";

import {
  Activity,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Layers3,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Video,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Platform =
  | "meta"
  | "google"
  | "linkedin";

type StrategySignal = {
  type:
    | "hook_shift"
    | "offer_shift"
    | "cta_shift"
    | "format_shift"
    | "messaging_shift"
    | "creative_expansion"
    | "creative_retrenchment"
    | "creative_fatigue"
    | "creator_expansion"
    | "persistence_shift";

  severity:
    | "info"
    | "watch"
    | "important";

  title: string;
  summary: string;
  evidence: string[];
  windowDays: number;
  score: number;
};

type StrategyIntelligence = {
  state:
    | "stable"
    | "evolving"
    | "shifting";

  confidence:
    | "low"
    | "medium"
    | "high";

  score: number;
  signals: StrategySignal[];

  dominantBefore:
    | string
    | null;

  dominantNow:
    | string
    | null;

  summary: string;
  evidenceCount: number;
  windowDays: number;
  generatedAt: string;
};

type Analysis = {
  totalAds: number;
  activeAds: number;
  inactiveAds: number;

  activeShare: number;
  videoShare: number;
  imageShare: number;
  carouselShare: number;
  creatorShare: number;

  averageRunningDays: number;
  medianRunningDays: number;
  longestRunningDays: number;

  momentum: {
    newLast7Days: number;
    newLast30Days: number;
    retiredLast30Days: number;
    persistent30Days: number;
    persistent60Days: number;
    refreshRate30Days: number;
  };

  formatMix: Array<{
    label: string;
    count: number;
    share: number;
  }>;

  topCreators: Array<{
    label: string;
    count: number;
    share: number;
  }>;

  topHooks: Array<{
    label: string;
    count: number;
    share: number;
  }>;

  topOffers: Array<{
    label: string;
    count: number;
    share: number;
  }>;

  topCtas: Array<{
    label: string;
    count: number;
    share: number;
  }>;

  repetition: {
    uniqueHooks: number;
    repeatedHookAds: number;
    repeatedHookShare: number;

    uniqueOffers: number;
    repeatedOfferAds: number;
    repeatedOfferShare: number;
  };

  patternsToInvestigate: Array<{
    title: string;
    detail: string;
    evidence: string;
  }>;

  strategy: StrategyIntelligence;
};

function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-950 text-white">
          {icon}
        </span>

        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </span>
      </div>

      <div className="text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </div>

      <div className="mt-1 text-xs text-slate-500">
        {detail}
      </div>
    </div>
  );
}

function SignalList({
  title,
  rows,
}: {
  title: string;
  rows: Analysis["topHooks"];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h4 className="text-sm font-semibold text-slate-950">
        {title}
      </h4>

      <div className="mt-4 space-y-3">
        {rows.length ? (
          rows
            .slice(0, 5)
            .map((row) => (
              <div
                key={`${title}:${row.label}`}
              >
                <div className="mb-1 flex items-start justify-between gap-4">
                  <span className="min-w-0 truncate text-xs font-medium text-slate-700">
                    {row.label}
                  </span>

                  <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                    {row.count}
                  </span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-[width] duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          4,
                          row.share,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))
        ) : (
          <p className="text-xs text-slate-400">
            No signal yet.
          </p>
        )}
      </div>
    </div>
  );
}

function strategyStateLabel(
  state: StrategyIntelligence["state"],
): string {
  if (state === "shifting") {
    return "Strategy shifting";
  }

  if (state === "evolving") {
    return "Strategy evolving";
  }

  return "Strategy stable";
}

function strategyStateIcon(
  state: StrategyIntelligence["state"],
) {
  if (state === "shifting") {
    return (
      <TrendingUp
        size={16}
      />
    );
  }

  if (state === "evolving") {
    return (
      <BrainCircuit
        size={16}
      />
    );
  }

  return (
    <CheckCircle2
      size={16}
    />
  );
}

function severityClasses(
  severity: StrategySignal["severity"],
): string {
  if (severity === "important") {
    return "border-slate-300 bg-slate-50 text-slate-950";
  }

  if (severity === "watch") {
    return "border-blue-100 bg-blue-50/50 text-slate-900";
  }

  return "border-slate-100 bg-white text-slate-700";
}

function StrategySignalCard({
  signal,
}: {
  signal: StrategySignal;
}) {
  const [open, setOpen] =
    useState(false);

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${severityClasses(
        signal.severity,
      )}`}
    >
      <button
        type="button"
        onClick={() =>
          setOpen((value) => !value)
        }
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
          <Target size={14} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-950">
            {signal.title}
          </span>

          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {signal.summary}
          </span>
        </span>

        <ChevronDown
          size={15}
          className={`mt-1 shrink-0 text-slate-400 transition-transform ${
            open
              ? "rotate-180"
              : ""
          }`}
        />
      </button>

      {open ? (
        <div className="mt-4 ml-11 space-y-2">
          {signal.evidence.map(
            (item, index) => (
              <div
                key={`${signal.type}:${index}`}
                className="flex gap-2 text-xs leading-5 text-slate-600"
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>{item}</span>
              </div>
            ),
          )}
        </div>
      ) : null}

      <div className="mt-3 ml-11 flex items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-slate-400">
        <span>
          {signal.severity}
        </span>

        <span>•</span>

        <span>
          {signal.windowDays}d window
        </span>
      </div>
    </div>
  );
}

function AdSpyStrategy({
  strategy,
}: {
  strategy: StrategyIntelligence;
}) {
  const topSignals =
    strategy.signals.slice(
      0,
      4,
    );

  const stateScore =
    Math.min(
      100,
      Math.max(
        0,
        strategy.score,
      ),
    );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600">
            STRATEGY INTELLIGENCE
          </span>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight text-slate-950">
              What the competitor appears to be changing
            </h3>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              {strategyStateIcon(
                strategy.state,
              )}
              {strategyStateLabel(
                strategy.state,
              )}
            </span>
          </div>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            {strategy.summary}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
          <ShieldCheck size={15} />
          {strategy.confidence} confidence
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Shift score
          </div>

          <div className="mt-2 flex items-end justify-between gap-3">
            <span className="text-xl font-semibold text-slate-950">
              {strategy.score}
            </span>

            <span className="text-xs text-slate-400">
              / 100
            </span>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-[width] duration-700"
              style={{
                width: `${stateScore}%`,
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Evidence
          </div>

          <div className="mt-2 text-xl font-semibold text-slate-950">
            {strategy.evidenceCount}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            observed rows + versions
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Analysis window
          </div>

          <div className="mt-2 text-xl font-semibold text-slate-950">
            {strategy.windowDays}d
          </div>

          <div className="mt-1 text-xs text-slate-500">
            recent vs previous creative signals
          </div>
        </div>
      </div>

      {(strategy.dominantBefore ||
        strategy.dominantNow) ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Previous dominant messaging
            </div>

            <div className="mt-2 text-sm font-semibold capitalize text-slate-950">
              {strategy.dominantBefore
                ? strategy.dominantBefore.replace(
                    /-/g,
                    " ",
                  )
                : "Not enough data"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Current dominant messaging
            </div>

            <div className="mt-2 text-sm font-semibold capitalize text-slate-950">
              {strategy.dominantNow
                ? strategy.dominantNow.replace(
                    /-/g,
                    " ",
                  )
                : "Not enough data"}
            </div>
          </div>
        </div>
      ) : null}

      {topSignals.length ? (
        <div className="mt-5 space-y-2">
          {topSignals.map(
            (signal) => (
              <StrategySignalCard
                key={`${signal.type}:${signal.title}`}
                signal={signal}
              />
            ),
          )}
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">
          <Sparkles
            size={15}
          />
          Not enough historical variation yet to identify a strong strategy shift.
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-400">
        <ShieldCheck size={14} />
        Strategy signals are observational intelligence, not proof of ad performance.
      </div>
    </section>
  );
}

export function AdSpyAnalysis({
  query,
  country,
  platform,
}: {
  query: string;
  country: string;
  platform: Platform;
}) {
  const [
    analysis,
    setAnalysis,
  ] =
    useState<Analysis | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(false);

  useEffect(() => {
    const q =
      query.trim();

    if (q.length < 2) {
      return;
    }

    let cancelled = false;

    const controller =
      new AbortController();

    const timer =
      window.setTimeout(
        async () => {
          setLoading(true);

          try {
            const url =
              new URL(
                "/api/ad-intelligence/analysis",
                window.location.origin,
              );

            url.searchParams.set(
              "q",
              q,
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

            if (
              !response.ok
            ) {
              return;
            }

            const data =
              await response.json();

            if (
              !cancelled &&
              data?.success &&
              data?.analysis
            ) {
              setAnalysis(
                data.analysis as Analysis,
              );
            }
          } catch (error) {
            if (
              error instanceof
              DOMException &&
              error.name ===
                "AbortError"
            ) {
              return;
            }
          } finally {
            if (!cancelled) {
              setLoading(false);
            }
          }
        },
        700,
      );

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(
        timer,
      );
    };
  }, [
    query,
    country,
    platform,
  ]);

  const hasSearchQuery =
    query.trim().length >=
    2;

  const videoCount =
    useMemo(
      () =>
        analysis?.formatMix.find(
          (item) =>
            item.label ===
            "Video",
        )?.count ?? 0,
      [analysis],
    );

  if (
    !hasSearchQuery ||
    (!analysis &&
      !loading)
  ) {
    return null;
  }

  if (
    loading &&
    !analysis
  ) {
    return (
      <section className="mx-auto mt-5 max-w-[1040px] rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <span className="inline-flex h-8 w-8 animate-pulse items-center justify-center rounded-lg bg-slate-100">
            <Sparkles
              size={15}
            />
          </span>

          Building competitive intelligence…
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-slate-800" />
        </div>
      </section>
    );
  }

  if (!analysis) {
    return null;
  }

  return (
    <section className="mx-auto mt-5 max-w-[1040px] space-y-5 pb-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600">
              COMPETITIVE ANALYSIS
            </span>

            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
              What the market is actually doing
            </h2>

            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Derived from the matching ad set for{" "}
              <strong className="text-slate-700">
                {query}
              </strong>
              .
            </p>
          </div>

          <span className="text-xs text-slate-400">
            Observed source data · no invented performance metrics
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric
            label="Results"
            value={
              analysis.totalAds
            }
            detail={`${analysis.activeAds} currently active`}
            icon={
              <Activity size={16} />
            }
          />

          <Metric
            label="Active share"
            value={`${analysis.activeShare}%`}
            detail={`${analysis.inactiveAds} inactive`}
            icon={
              <TrendingUp size={16} />
            }
          />

          <Metric
            label="Video"
            value={`${analysis.videoShare}%`}
            detail={`${videoCount} video creatives`}
            icon={
              <Video size={16} />
            }
          />

          <Metric
            label="Average run"
            value={`${analysis.averageRunningDays}d`}
            detail={`Median ${analysis.medianRunningDays}d`}
            icon={
              <Clock3 size={16} />
            }
          />

          <Metric
            label="Longest"
            value={`${analysis.longestRunningDays}d`}
            detail="Observed persistence"
            icon={
              <BarChart3 size={16} />
            }
          />
        </div>
      </div>

      <AdSpyStrategy
        strategy={
          analysis.strategy
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                CREATIVE MOMENTUM
              </span>

              <h3 className="mt-1 text-base font-semibold text-slate-950">
                Launch and refresh activity
              </h3>
            </div>

            <TrendingUp
              size={18}
              className="text-slate-400"
            />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              [
                "New · 7d",
                analysis
                  .momentum
                  .newLast7Days,
              ],
              [
                "New · 30d",
                analysis
                  .momentum
                  .newLast30Days,
              ],
              [
                "Retired · 30d",
                analysis
                  .momentum
                  .retiredLast30Days,
              ],
              [
                "Persistent · 30d+",
                analysis
                  .momentum
                  .persistent30Days,
              ],
            ].map(
              ([
                label,
                value,
              ]) => (
                <div
                  key={String(
                    label,
                  )}
                  className="rounded-2xl bg-slate-50 p-4"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {label}
                  </div>

                  <div className="mt-2 text-xl font-semibold text-slate-950">
                    {value}
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">
                30-day creative refresh activity
              </span>

              <strong className="text-slate-950">
                {
                  analysis
                    .momentum
                    .refreshRate30Days
                }
                %
              </strong>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900 transition-[width] duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    analysis
                      .momentum
                      .refreshRate30Days,
                  )}%`,
                }}
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              REPETITION
            </span>

            <h3 className="mt-1 text-base font-semibold text-slate-950">
              Which creative ideas keep repeating?
            </h3>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Hook reuse
              </div>

              <div className="mt-2 text-xl font-semibold text-slate-950">
                {
                  analysis
                    .repetition
                    .repeatedHookShare
                }
                %
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {
                  analysis
                    .repetition
                    .uniqueHooks
                }{" "}
                unique hooks
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Offer reuse
              </div>

              <div className="mt-2 text-xl font-semibold text-slate-950">
                {
                  analysis
                    .repetition
                    .repeatedOfferShare
                }
                %
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {
                  analysis
                    .repetition
                    .uniqueOffers
                }{" "}
                unique offers
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-100 p-4 text-xs text-slate-500">
            <Repeat2
              size={15}
            />
            Repetition is an observation, not proof of performance.
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SignalList
          title="Top hooks"
          rows={
            analysis.topHooks
          }
        />

        <SignalList
          title="Top offers"
          rows={
            analysis.topOffers
          }
        />

        <SignalList
          title="Top CTAs"
          rows={
            analysis.topCtas
          }
        />

        <SignalList
          title="Top creators"
          rows={
            analysis.topCreators
          }
        />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Layers3
            size={17}
            className="text-slate-500"
          />

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              FORMAT MIX
            </span>

            <h3 className="mt-1 text-base font-semibold text-slate-950">
              How the competitor is building creatives
            </h3>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {analysis.formatMix.map(
            (item) => (
              <div
                key={
                  item.label
                }
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    {item.label}
                  </span>

                  <span className="font-semibold text-slate-950">
                    {item.share}% ·{" "}
                    {item.count}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-[width] duration-500"
                    style={{
                      width: `${Math.max(
                        item.share,
                        item.count
                          ? 2
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Target
            size={17}
            className="text-slate-500"
          />

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              PATTERNS
            </span>

            <h3 className="mt-1 text-base font-semibold text-slate-950">
              Signals worth investigating
            </h3>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {analysis.patternsToInvestigate.length ? (
            analysis.patternsToInvestigate.map(
              (
                pattern,
              ) => (
                <div
                  key={
                    pattern.title
                  }
                  className="rounded-2xl border border-slate-100 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                      <TrendingDown
                        size={14}
                      />
                    </span>

                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-slate-950">
                        {
                          pattern.title
                        }
                      </h4>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {
                          pattern.detail
                        }
                      </p>

                      <p className="mt-2 text-[11px] font-medium text-slate-400">
                        {
                          pattern.evidence
                        }
                      </p>
                    </div>
                  </div>
                </div>
              ),
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-xs text-slate-400">
              No additional pattern has enough evidence yet.
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center gap-2 px-1 text-[11px] text-slate-400">
        <ShieldCheck
          size={14}
        />
        All strategy and competitive signals are derived from observed creative data. They do not represent hidden ad spend, conversions, or ROAS.
      </div>
    </section>
  );
}