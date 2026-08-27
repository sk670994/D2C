"use client";

import {
  Activity,
  BarChart3,
  Clock3,
  Layers3,
  Repeat2,
  Sparkles,
  TrendingUp,
  Video,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";

type Platform =
  | "meta"
  | "google"
  | "linkedin";

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
};

function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white">
          {icon}
        </span>

        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
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
          rows.slice(0, 5).map(
            (row) => (
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
                    className="h-full rounded-full bg-slate-900"
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
            ),
          )
        ) : (
          <p className="text-xs text-slate-400">
            No signal yet.
          </p>
        )}
      </div>
    </div>
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
  const [analysis, setAnalysis] =
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
      setAnalysis(null);
      return;
    }

    let cancelled = false;

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
                },
              );

            const data =
              await response.json();

            if (
              !cancelled &&
              response.ok &&
              data?.success
            ) {
              setAnalysis(
                data.analysis ??
                  null,
              );
            }
          } finally {
            if (!cancelled) {
              setLoading(false);
            }
          }
        },
        900,
      );

    return () => {
      cancelled = true;
      window.clearTimeout(
        timer,
      );
    };
  }, [
    query,
    country,
    platform,
  ]);

  if (
    !analysis &&
    !loading
  ) {
    return null;
  }

  if (loading && !analysis) {
    return (
      <section className="mx-auto mt-5 max-w-[1040px] rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <span className="inline-flex h-8 w-8 animate-pulse items-center justify-center rounded-lg bg-slate-100">
            <Sparkles size={15} />
          </span>
          Building competitive intelligence…
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
              Derived from the full indexed creative set for{" "}
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
            label="Indexed"
            value={analysis.totalAds}
            detail={`${analysis.activeAds} currently active`}
            icon={<Activity size={16} />}
          />

          <Metric
            label="Active share"
            value={`${analysis.activeShare}%`}
            detail={`${analysis.inactiveAds} inactive`}
            icon={<TrendingUp size={16} />}
          />

          <Metric
            label="Video"
            value={`${analysis.videoShare}%`}
            detail={`${analysis.formatMix.find(
              (item) =>
                item.label ===
                "Video",
            )?.count ?? 0} video creatives`}
            icon={<Video size={16} />}
          />

          <Metric
            label="Average run"
            value={`${analysis.averageRunningDays}d`}
            detail={`Median ${analysis.medianRunningDays}d`}
            icon={<Clock3 size={16} />}
          />

          <Metric
            label="Longest"
            value={`${analysis.longestRunningDays}d`}
            detail="Observed persistence"
            icon={<BarChart3 size={16} />}
          />
        </div>
      </div>

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

            <TrendingUp size={18} className="text-slate-400" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              [
                "New · 7d",
                analysis.momentum.newLast7Days,
              ],
              [
                "New · 30d",
                analysis.momentum.newLast30Days,
              ],
              [
                "Retired · 30d",
                analysis.momentum.retiredLast30Days,
              ],
              [
                "Persistent · 30d+",
                analysis.momentum.persistent30Days,
              ],
            ].map(
              ([label, value]) => (
                <div
                  key={String(label)}
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
                {analysis.momentum.refreshRate30Days}%
              </strong>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900"
                style={{
                  width: `${Math.min(
                    100,
                    analysis.momentum.refreshRate30Days,
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
                {analysis.repetition.repeatedHookShare}%
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {analysis.repetition.uniqueHooks} unique hooks
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Offer reuse
              </div>

              <div className="mt-2 text-xl font-semibold text-slate-950">
                {analysis.repetition.repeatedOfferShare}%
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {analysis.repetition.uniqueOffers} unique offers
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-100 p-4 text-xs text-slate-500">
            <Repeat2 size={15} />
            Repetition is an observation, not proof of performance.
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SignalList
          title="Top hooks"
          rows={analysis.topHooks}
        />

        <SignalList
          title="Top offers"
          rows={analysis.topOffers}
        />

        <SignalList
          title="Top CTAs"
          rows={analysis.topCtas}
        />

        <SignalList
          title="Top creators"
          rows={analysis.topCreators}
        />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Layers3 size={17} className="text-slate-500" />

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
                key={item.label}
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    {item.label}
                  </span>

                  <span className="font-semibold text-slate-950">
                    {item.share}% · {item.count}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900"
                    style={{
                      width: `${Math.max(
                        item.share,
                        item.count ? 2 : 0,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <Sparkles size={18} />
          </span>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
              PATTERNS TO INVESTIGATE
            </span>

            <h3 className="mt-1 text-base font-semibold">
              Useful observations for your next research session
            </h3>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {analysis.patternsToInvestigate.map(
            (item) => (
              <div
                key={`${item.title}:${item.evidence}`}
                className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"
              >
                <div className="text-sm font-semibold">
                  {item.title}
                </div>

                <p className="mt-1 text-xs leading-5 text-white/60">
                  {item.detail}
                </p>

                <div className="mt-3 text-[11px] font-semibold text-emerald-300">
                  {item.evidence}
                </div>
              </div>
            ),
          )}
        </div>

        <p className="mt-5 text-[11px] leading-5 text-white/40">
          These are derived from observed public creative data. They are research signals, not conversion or ROAS claims.
        </p>
      </section>
    </section>
  );
}