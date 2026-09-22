/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, Loader2, TrendingUp } from "lucide-react";

type Props = { pageId: string; country: string };

type Profile = {
  advertiserId: string;
  advertiserName?: string | null;
  totalAds: number;
  activeAds: number;
  inactiveAds: number;
  videoAds: number;
  imageAds: number;
  carouselAds: number;
  creatorAds: number;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  averageRunningDays?: number | null;
  longestRunningDays?: number | null;
  topCreators?: Array<{ label: string; count: number }>;
  topOffers?: Array<{ label: string; count: number }>;
  topHooks?: Array<{ label: string; count: number }>;
};

type TimelineRow = {
  month_start: string;
  observed_ads: number;
  new_ads: number;
  stopped_ads: number;
};

type Changes = {
  windowDays?: number;
  newAds?: number;
  stoppedAds?: number;
};

export function AdvertiserIntelligenceCard({ pageId, country }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [watching, setWatching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [watchLoading, setWatchLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    fetch(
      `/api/ad-intelligence/advertiser/${encodeURIComponent(pageId)}?country=${encodeURIComponent(country)}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Advertiser intelligence failed.");
        }
        if (!alive) return;
        setProfile(data.profile ?? null);
        setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
        setChanges(data.changes ?? null);
        setWatching(Boolean(data.watching));
      })
      .catch((reason) => {
        if (alive) setError(reason instanceof Error ? reason.message : "Advertiser intelligence failed.");
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [country, pageId]);

  const maxObserved = useMemo(
    () => Math.max(1, ...timeline.map((row) => Number(row.observed_ads ?? 0))),
    [timeline],
  );

  async function toggleWatch() {
    setWatchLoading(true);
    try {
      const response = await fetch(
        `/api/ad-intelligence/advertiser/${encodeURIComponent(pageId)}?country=${encodeURIComponent(country)}`,
        {
          method: watching ? "DELETE" : "POST",
          cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ country }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Watchlist update failed.");
      setWatching(Boolean(data.watching));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Watchlist update failed.");
    } finally {
      setWatchLoading(false);
    }
  }

  if (loading) {
    return (
      <section className="adspy-intelligence-card" aria-live="polite">
        <div className="adspy-intelligence-header">
          <span>Advertiser intelligence</span>
          <Loader2 size={16} className="animate-spin" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="adspy-intelligence-card" aria-live="polite">
        <div className="adspy-intelligence-header">
          <span>Advertiser intelligence</span>
        </div>
        <p>{error}</p>
      </section>
    );
  }

  if (!profile) return null;

  return (
    <section className="adspy-intelligence-card" aria-label="Advertiser intelligence">
      <div className="adspy-intelligence-header">
        <div>
          <div className="adspy-intelligence-kicker">ADVERTISER INTELLIGENCE</div>
          <h3>{profile.advertiserName || "Unknown advertiser"}</h3>
          <span>Meta Page ID {profile.advertiserId}</span>
        </div>
        <button
          type="button"
          className="adspy-secondary-button"
          disabled={watchLoading}
          onClick={() => void toggleWatch()}
        >
          {watchLoading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : watching ? (
            <BookmarkCheck size={15} />
          ) : (
            <Bookmark size={15} />
          )}
          {watching ? "Watching" : "Watch"}
        </button>
      </div>

      <div className="adspy-intelligence-stats">
        <div><strong>{profile.totalAds}</strong><span>Total ads</span></div>
        <div><strong>{profile.activeAds}</strong><span>Active</span></div>
        <div><strong>{profile.videoAds}</strong><span>Video</span></div>
        <div><strong>{profile.creatorAds}</strong><span>Creator</span></div>
        <div><strong>{profile.longestRunningDays}</strong><span>Longest days</span></div>
      </div>

      {changes ? (
        <div className="adspy-intelligence-changes">
          <div><strong>{changes.newAds ?? 0}</strong><span>New in {changes.windowDays ?? 30}d</span></div>
          <div><strong>{changes.stoppedAds ?? 0}</strong><span>Stopped in {changes.windowDays ?? 30}d</span></div>
        </div>
      ) : null}

      <div className="adspy-intelligence-grid">
        <div>
          <strong>Observed</strong>
          <span>
            {profile.firstSeenAt
              ? new Date(profile.firstSeenAt).toLocaleDateString("en-IN")
              : "—"}
            {" → "}
            {profile.lastSeenAt
              ? new Date(profile.lastSeenAt).toLocaleDateString("en-IN")
              : "—"}
          </span>
        </div>
        <div>
          <strong>Average running</strong>
          <span>{profile.averageRunningDays ?? 0} days</span>
        </div>
      </div>

      <div className="adspy-intelligence-columns">
        <div>
          <div className="adspy-intelligence-section-title">Top hooks</div>
          {(profile.topHooks ?? []).slice(0, 5).map((item, index) => (
            <div key={`${item.label}-${index}`} className="adspy-intelligence-item">
              <span>{item.label || "Unlabeled"}</span><b>{item.count}</b>
            </div>
          ))}
        </div>

        <div>
          <div className="adspy-intelligence-section-title">Top offers</div>
          {(profile.topOffers ?? []).slice(0, 5).map((item, index) => (
            <div key={`${item.label}-${index}`} className="adspy-intelligence-item">
              <span>{item.label || "Unlabeled"}</span><b>{item.count}</b>
            </div>
          ))}
        </div>

        <div>
          <div className="adspy-intelligence-section-title">Top creators</div>
          {(profile.topCreators ?? []).slice(0, 5).map((item, index) => (
            <div key={`${item.label}-${index}`} className="adspy-intelligence-item">
              <span>{item.label || "Unlabeled"}</span><b>{item.count}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="adspy-intelligence-timeline">
        <div className="adspy-intelligence-section-title">
          <TrendingUp size={15} /> 12-month creative activity
        </div>
        {timeline.map((row) => (
          <div key={row.month_start} className="adspy-timeline-row">
            <span>{new Date(row.month_start).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</span>
            <div className="adspy-timeline-track">
              <div
                className="adspy-timeline-bar"
                style={{ width: `${Math.max(3, (Number(row.observed_ads ?? 0) / maxObserved) * 100)}%` }}
              />
            </div>
            <b>{row.observed_ads}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
