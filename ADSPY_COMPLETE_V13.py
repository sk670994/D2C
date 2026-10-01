
from pathlib import Path
import shutil
import subprocess
from datetime import datetime

ROOT = Path.cwd()

UI = ROOT / "components/dashboard/adspy/AdSpySection.tsx"
SEARCH = ROOT / "lib/ad-intelligence/global/accurate-search.ts"
ROUTE = ROOT / "app/api/ad-intelligence/search/route.ts"
CSS = ROOT / "components/dashboard/adspy/adspy.css"
MIGRATION = ROOT / "supabase/migrations/20260922020000_adspy_advertiser_intelligence_v1.sql"
PROFILE_ROUTE_PATH = ROOT / "app/api/ad-intelligence/advertiser/[pageId]/route.ts"
PROFILE_COMPONENT_PATH = ROOT / "components/dashboard/adspy/AdvertiserIntelligenceCard.tsx"

def read(p):
    return p.read_text(encoding="utf-8-sig")

def write(p, s):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8", newline="\n")

def fail(msg):
    raise RuntimeError(msg)

def replace_once(p, old, new, label):
    s = read(p)
    n = s.count(old)
    if n != 1:
        fail(f"{label}: expected 1 match in {p}, found {n}")
    write(p, s.replace(old, new, 1))
    print(f"[OK] {label}")

def insert_before(p, marker, block, label):
    s = read(p)
    n = s.count(marker)
    if n != 1:
        fail(f"{label}: expected 1 marker in {p}, found {n}")
    write(p, s.replace(marker, block + marker, 1))
    print(f"[OK] {label}")

for p in [UI, SEARCH, ROUTE]:
    if not p.exists():
        fail(f"Missing required file: {p}")

# V12 guard.
for p, markers in {
    UI: ["languageFilter", "regionFilter", "Apply filters"],
    SEARCH: ["adspy_search_metrics_v2", "adspy_search_creatives_v4"],
    ROUTE: ["creativeTypeValue", "activeStatusValue"],
}.items():
    s = read(p)
    missing = [m for m in markers if m not in s]
    if missing:
        fail(f"{p} is not the expected V12 state. Missing: {missing}")

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
BACKUP = ROOT / f".adspy-complete-v13-backup-{stamp}"
BACKUP.mkdir()
for p in [UI, SEARCH, ROUTE, CSS]:
    if p.exists():
        dst = BACKUP / p.relative_to(ROOT)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dst)
print(f"[OK] Backup created: {BACKUP.name}")

MIGRATION_SQL = r'''BEGIN;

CREATE TABLE IF NOT EXISTS public.adspy_advertiser_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  advertiser_name TEXT,
  country TEXT NOT NULL DEFAULT 'IN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, advertiser_id, country)
);

CREATE INDEX IF NOT EXISTS adspy_watchlists_user_idx
  ON public.adspy_advertiser_watchlists(user_id, updated_at DESC);

ALTER TABLE public.adspy_advertiser_watchlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adspy_watchlist_select_own
  ON public.adspy_advertiser_watchlists;
CREATE POLICY adspy_watchlist_select_own
  ON public.adspy_advertiser_watchlists
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS adspy_watchlist_insert_own
  ON public.adspy_advertiser_watchlists;
CREATE POLICY adspy_watchlist_insert_own
  ON public.adspy_advertiser_watchlists
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS adspy_watchlist_delete_own
  ON public.adspy_advertiser_watchlists;
CREATE POLICY adspy_watchlist_delete_own
  ON public.adspy_advertiser_watchlists
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.adspy_get_advertiser_profile(
  p_page_id TEXT,
  p_country TEXT DEFAULT 'IN',
  p_platform TEXT DEFAULT 'meta'
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
WITH base AS (
  SELECT c.*
  FROM public.ad_intelligence_creatives c
  WHERE c.platform = lower(trim(p_platform))
    AND c.advertiser_id = trim(p_page_id)
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(m.country) = upper(trim(coalesce(p_country, 'IN')))
    )
),
stats AS (
  SELECT
    count(*)::BIGINT AS total_ads,
    count(*) FILTER (WHERE is_currently_active = true)::BIGINT AS active_ads,
    count(*) FILTER (WHERE is_currently_active = false)::BIGINT AS inactive_ads,
    count(*) FILTER (WHERE creative_type ILIKE '%video%')::BIGINT AS video_ads,
    count(*) FILTER (WHERE creative_type ILIKE '%image%')::BIGINT AS image_ads,
    count(*) FILTER (WHERE creative_type ILIKE '%carousel%')::BIGINT AS carousel_ads,
    count(*) FILTER (WHERE creator_name IS NOT NULL AND trim(creator_name) <> '')::BIGINT AS creator_ads,
    min(first_seen_at) AS first_seen_at,
    max(last_seen_at) AS last_seen_at,
    round(avg(
      CASE
        WHEN first_seen_at IS NULL THEN NULL
        ELSE greatest(
          1,
          floor(extract(epoch from (coalesce(last_seen_at, now()) - first_seen_at)) / 86400.0) + 1
        )
      END
    ), 1) AS average_running_days,
    coalesce(max(
      CASE
        WHEN first_seen_at IS NULL THEN 0
        ELSE greatest(
          1,
          floor(extract(epoch from (coalesce(last_seen_at, now()) - first_seen_at)) / 86400.0) + 1
        )
      END
    ), 0)::INTEGER AS longest_running_days
  FROM base
),
tops AS (
  SELECT
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('label', creator_name, 'count', n)
        ORDER BY n DESC, creator_name
      )
      FROM (
        SELECT creator_name, count(*)::BIGINT AS n
        FROM base
        WHERE creator_name IS NOT NULL AND trim(creator_name) <> ''
        GROUP BY creator_name
        ORDER BY n DESC, creator_name
        LIMIT 8
      ) q
    ), '[]'::jsonb) AS top_creators,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('label', offer, 'count', n)
        ORDER BY n DESC, offer
      )
      FROM (
        SELECT offer, count(*)::BIGINT AS n
        FROM base
        WHERE offer IS NOT NULL AND trim(offer) <> ''
        GROUP BY offer
        ORDER BY n DESC, offer
        LIMIT 8
      ) q
    ), '[]'::jsonb) AS top_offers,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('label', hook, 'count', n)
        ORDER BY n DESC, hook
      )
      FROM (
        SELECT
          coalesce(
            nullif(intelligence->>'hook', ''),
            nullif(metadata->>'hook', ''),
            nullif(headline, '')
          ) AS hook,
          count(*)::BIGINT AS n
        FROM base
        GROUP BY 1
        HAVING coalesce(
          nullif(intelligence->>'hook', ''),
          nullif(metadata->>'hook', ''),
          nullif(headline, '')
        ) IS NOT NULL
        ORDER BY n DESC
        LIMIT 8
      ) q
    ), '[]'::jsonb) AS top_hooks
)
SELECT jsonb_build_object(
  'advertiserId', trim(p_page_id),
  'advertiserName', (
    SELECT advertiser_name
    FROM base
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  ),
  'platform', lower(trim(p_platform)),
  'country', upper(trim(coalesce(p_country, 'IN'))),
  'totalAds', s.total_ads,
  'activeAds', s.active_ads,
  'inactiveAds', s.inactive_ads,
  'videoAds', s.video_ads,
  'imageAds', s.image_ads,
  'carouselAds', s.carousel_ads,
  'creatorAds', s.creator_ads,
  'firstSeenAt', s.first_seen_at,
  'lastSeenAt', s.last_seen_at,
  'averageRunningDays', s.average_running_days,
  'longestRunningDays', s.longest_running_days,
  'topCreators', t.top_creators,
  'topOffers', t.top_offers,
  'topHooks', t.top_hooks
)
FROM stats s
CROSS JOIN tops t;
$$;

REVOKE ALL ON FUNCTION public.adspy_get_advertiser_profile(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_get_advertiser_profile(TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.adspy_get_advertiser_timeline(
  p_page_id TEXT,
  p_country TEXT DEFAULT 'IN',
  p_platform TEXT DEFAULT 'meta',
  p_months INTEGER DEFAULT 12
)
RETURNS TABLE(
  month_start DATE,
  observed_ads BIGINT,
  new_ads BIGINT,
  stopped_ads BIGINT
)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
WITH months AS (
  SELECT generate_series(
    date_trunc('month', now()) -
      make_interval(months => greatest(1, least(coalesce(p_months,12),24)) - 1),
    date_trunc('month', now()),
    interval '1 month'
  )::DATE AS month_start
),
base AS (
  SELECT c.*
  FROM public.ad_intelligence_creatives c
  WHERE c.platform = lower(trim(p_platform))
    AND c.advertiser_id = trim(p_page_id)
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(m.country) = upper(trim(coalesce(p_country,'IN')))
    )
)
SELECT
  m.month_start,
  count(b.id) FILTER (
    WHERE b.first_seen_at < m.month_start + interval '1 month'
      AND coalesce(b.last_seen_at, now()) >= m.month_start
  ) AS observed_ads,
  count(b.id) FILTER (
    WHERE b.first_seen_at >= m.month_start
      AND b.first_seen_at < m.month_start + interval '1 month'
  ) AS new_ads,
  count(b.id) FILTER (
    WHERE b.is_currently_active = false
      AND b.last_seen_at >= m.month_start
      AND b.last_seen_at < m.month_start + interval '1 month'
  ) AS stopped_ads
FROM months m
LEFT JOIN base b ON true
GROUP BY m.month_start
ORDER BY m.month_start;
$$;

REVOKE ALL ON FUNCTION public.adspy_get_advertiser_timeline(TEXT,TEXT,TEXT,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_get_advertiser_timeline(TEXT,TEXT,TEXT,INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.adspy_get_advertiser_changes(
  p_page_id TEXT,
  p_country TEXT DEFAULT 'IN',
  p_platform TEXT DEFAULT 'meta',
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
WITH base AS (
  SELECT c.*
  FROM public.ad_intelligence_creatives c
  WHERE c.platform = lower(trim(p_platform))
    AND c.advertiser_id = trim(p_page_id)
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(m.country) = upper(trim(coalesce(p_country,'IN')))
    )
),
recent AS (
  SELECT *
  FROM base
  WHERE first_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))
     OR last_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))
)
SELECT jsonb_build_object(
  'windowDays', greatest(1, least(coalesce(p_days,30),90)),
  'newAds', (SELECT count(*) FROM recent WHERE first_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))),
  'stoppedAds', (SELECT count(*) FROM recent WHERE is_currently_active = false AND last_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))),
  'newCreativeIds', coalesce((SELECT jsonb_agg(coalesce(external_ad_id, external_ad_key, id::text) ORDER BY first_seen_at DESC)
                              FROM recent
                              WHERE first_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))), '[]'::jsonb),
  'stoppedCreativeIds', coalesce((SELECT jsonb_agg(coalesce(external_ad_id, external_ad_key, id::text) ORDER BY last_seen_at DESC)
                                 FROM recent
                                 WHERE is_currently_active = false
                                   AND last_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.adspy_get_advertiser_changes(TEXT,TEXT,TEXT,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_get_advertiser_changes(TEXT,TEXT,TEXT,INTEGER) TO service_role;

COMMIT;
'''
write(MIGRATION, MIGRATION_SQL)
print(f"[OK] Created {MIGRATION.relative_to(ROOT)}")

PROFILE_ROUTE = r'''import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validPageId(value: string) {
  const v = value.trim();
  return /^\d+$/.test(v) ? v : null;
}

function validCountry(value: string | null) {
  const v = (value ?? "IN").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : "IN";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ pageId: string }> },
) {
  const auth = await createServerAuthClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { pageId: rawPageId } = await context.params;
  const pageId = validPageId(decodeURIComponent(rawPageId));

  if (!pageId) {
    return NextResponse.json({ success: false, error: "Invalid Meta Page ID." }, { status: 400 });
  }

  const country = validCountry(request.nextUrl.searchParams.get("country"));
  const service = createGlobalServiceClient();

  const [profile, timeline, changes, watch] = await Promise.all([
    service.rpc("adspy_get_advertiser_profile", {
      p_page_id: pageId,
      p_country: country,
      p_platform: "meta",
    }),
    service.rpc("adspy_get_advertiser_timeline", {
      p_page_id: pageId,
      p_country: country,
      p_platform: "meta",
      p_months: 12,
    }),
    service.rpc("adspy_get_advertiser_changes", {
      p_page_id: pageId,
      p_country: country,
      p_platform: "meta",
      p_days: 30,
    }),
    auth
      .from("adspy_advertiser_watchlists")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "meta")
      .eq("advertiser_id", pageId)
      .eq("country", country)
      .maybeSingle(),
  ]);

  for (const result of [profile, timeline, changes, watch]) {
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    pageId,
    country,
    profile: profile.data ?? null,
    timeline: timeline.data ?? [],
    changes: changes.data ?? null,
    watching: Boolean(watch.data),
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ pageId: string }> },
) {
  const auth = await createServerAuthClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { pageId: rawPageId } = await context.params;
  const pageId = validPageId(decodeURIComponent(rawPageId));
  if (!pageId) {
    return NextResponse.json({ success: false, error: "Invalid Meta Page ID." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const country = validCountry(typeof body?.country === "string" ? body.country : request.nextUrl.searchParams.get("country"));
  const service = createGlobalServiceClient();

  const { data: profile } = await service.rpc("adspy_get_advertiser_profile", {
    p_page_id: pageId,
    p_country: country,
    p_platform: "meta",
  });

  const { error } = await auth
    .from("adspy_advertiser_watchlists")
    .upsert(
      {
        user_id: user.id,
        platform: "meta",
        advertiser_id: pageId,
        advertiser_name:
          profile && typeof profile === "object"
            ? String((profile as Record<string, unknown>).advertiserName ?? "")
            : null,
        country,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform,advertiser_id,country" },
    );

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, watching: true });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ pageId: string }> },
) {
  const auth = await createServerAuthClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { pageId: rawPageId } = await context.params;
  const pageId = validPageId(decodeURIComponent(rawPageId));
  if (!pageId) {
    return NextResponse.json({ success: false, error: "Invalid Meta Page ID." }, { status: 400 });
  }

  const country = validCountry(request.nextUrl.searchParams.get("country"));

  const { error } = await auth
    .from("adspy_advertiser_watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", "meta")
    .eq("advertiser_id", pageId)
    .eq("country", country);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, watching: false });
}
'''
write(PROFILE_ROUTE_PATH, PROFILE_ROUTE)
print(f"[OK] Created {PROFILE_ROUTE_PATH.relative_to(ROOT)}")

PROFILE_COMPONENT = r'''/* eslint-disable @next/next/no-img-element */
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
'''
write(PROFILE_COMPONENT_PATH, PROFILE_COMPONENT)
print(f"[OK] Created {PROFILE_COMPONENT_PATH.relative_to(ROOT)}")

# ---- UI integration ----
ui = read(UI)
if 'import { AdvertiserIntelligenceCard } from "./AdvertiserIntelligenceCard";' not in ui:
    replace_once(
        UI,
        '} from "lucide-react";',
        '} from "lucide-react";\nimport { AdvertiserIntelligenceCard } from "./AdvertiserIntelligenceCard";',
        "Import advertiser intelligence component",
    )

ui = read(UI)
if "<AdvertiserIntelligenceCard" not in ui:
    # Prefer insertion immediately before the first results container.
    candidates = [
        '<div className="adspy-results',
        '<section className="adspy-results',
        '<div className="adspy-results-shell',
    ]
    marker = next((m for m in candidates if m in ui), None)
    if marker is None:
        fail("Could not locate AdSpy results container for profile insertion.")
    block = '''            {selectedPageId && platform === "meta" && mode === "advertiser" ? (
              <AdvertiserIntelligenceCard
                pageId={selectedPageId}
                country={countryInput.trim().toUpperCase() || "IN"}
              />
            ) : null}

'''
    insert_before(UI, marker, block, "Insert advertiser intelligence panel")

# ---- CSS ----
if CSS.exists() and ".adspy-intelligence-card" not in read(CSS):
    css = r'''
.adspy-intelligence-card {
  margin-top: 14px;
  border: 1px solid var(--zt-border, rgba(255,255,255,.12));
  border-radius: 16px;
  padding: 16px;
  background: var(--zt-surface, rgba(255,255,255,.03));
}
.adspy-intelligence-header,
.adspy-intelligence-stats,
.adspy-intelligence-grid,
.adspy-intelligence-changes {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.adspy-intelligence-header h3 { margin: 3px 0; }
.adspy-intelligence-kicker { font-size: 10px; letter-spacing: .12em; opacity: .65; }
.adspy-intelligence-stats,
.adspy-intelligence-changes {
  margin-top: 14px;
  justify-content: flex-start;
  flex-wrap: wrap;
}
.adspy-intelligence-stats > div,
.adspy-intelligence-changes > div {
  min-width: 92px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.adspy-intelligence-stats strong,
.adspy-intelligence-changes strong { font-size: 18px; }
.adspy-intelligence-stats span,
.adspy-intelligence-changes span,
.adspy-intelligence-grid span { opacity: .65; font-size: 12px; }
.adspy-intelligence-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}
.adspy-intelligence-section-title {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
}
.adspy-intelligence-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid rgba(255,255,255,.07);
  font-size: 12px;
}
.adspy-intelligence-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.adspy-intelligence-timeline { margin-top: 16px; }
.adspy-timeline-row {
  display: grid;
  grid-template-columns: 56px 1fr 42px;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  font-size: 11px;
}
.adspy-timeline-track {
  height: 7px;
  border-radius: 99px;
  background: rgba(127,127,127,.16);
  overflow: hidden;
}
.adspy-timeline-bar {
  height: 100%;
  border-radius: 99px;
  background: currentColor;
  opacity: .75;
}
@media (max-width: 800px) {
  .adspy-intelligence-columns { grid-template-columns: 1fr; }
}
'''
    write(CSS, read(CSS) + "\n" + css)
    print("[OK] Added advertiser intelligence CSS")

# ---- build ----
print("\n=== RUNNING PRODUCTION BUILD ===")
build = run("npm", "run", "build")
print(build.stdout)
if build.returncode != 0:
    print(build.stderr)
    print("[ROLLBACK] Restoring modified files...")
    for p in [UI, SEARCH, ROUTE, CSS]:
        src = BACKUP / p.relative_to(ROOT)
        if src.exists():
            shutil.copy2(src, p)
    for p in [MIGRATION, PROFILE_ROUTE_PATH, PROFILE_COMPONENT_PATH]:
        if p.exists():
            p.unlink()
    print("[ROLLBACK] Complete.")
    raise SystemExit(build.returncode)

print("\n=== V13 READY ===")
print(f"Backup retained: {BACKUP.name}")
print(f"Migration: {MIGRATION.relative_to(ROOT)}")
print("Next: npx supabase db push --dry-run")
