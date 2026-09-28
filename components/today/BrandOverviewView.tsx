"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { BrandOverview, CreativePatterns } from "@/lib/today/load";
import { ELEMENT_LABEL, type ElementKey } from "@/lib/decode/taxonomy";
import { changeTitle } from "@/lib/today/changes";

import { CountUp, GrowBar, Rise, SparkBar } from "./motion";
import { EvidenceTile, formatInt, Initial, timeAgo } from "./parts";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: BrandOverview };

function topOf(patterns: CreativePatterns, key: ElementKey): string {
  const p = patterns.top.find((item) => item.key === key);
  return p ? `${p.label} (${p.share}%)` : "—";
}

const PATTERN_KEYS: ElementKey[] = ["hookType", "angle", "persona", "visualStyle", "language", "emotion"];

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function BrandOverviewView({ pageId, country = "IN" }: { pageId: string; country?: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/today/brand/${encodeURIComponent(pageId)}?country=${encodeURIComponent(country)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { success: boolean; error?: string; overview?: BrandOverview };
        if (!alive) return;
        if (!response.ok || !body.success || !body.overview) throw new Error(body.error || "Could not load this brand.");
        setState({ status: "ready", data: body.overview });
      })
      .catch((error: unknown) => alive && setState({ status: "error", message: error instanceof Error ? error.message : "Could not load this brand." }));
    return () => {
      alive = false;
    };
  }, [pageId, country]);

  if (state.status === "loading") {
    return (
      <div className="zd-col" aria-busy="true" aria-label="Loading brand">
        <div className="zd-skel" style={{ height: 160 }} />
        <div className="zd-skel" style={{ height: 90 }} />
        <div className="zd-skel" style={{ height: 380 }} />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p className="zd-error" role="alert">
        {state.message}
      </p>
    );
  }

  const b = state.data;
  const adsHref = `/adspy?q=${encodeURIComponent(b.name)}&pid=${encodeURIComponent(b.pageId)}`;
  const metaAll = b.coverage?.all?.total ?? null;
  const metaActive = b.coverage?.active?.total ?? null;
  const coverage = metaAll ? { meta: metaAll, held: b.total, label: "all-time" } : metaActive ? { meta: metaActive, held: b.active, label: "live" } : null;
  const maxDay = Math.max(1, ...b.launches14);
  const staying = b.longestLive && b.longestLive.days >= 60 ? b.longestLive : null;

  return (
    <>
      <nav aria-label="Breadcrumb" className="zd-row" style={{ fontSize: 13, color: "var(--zd-muted)", gap: 8 }}>
        <Link href="/today">Today</Link>
        <span aria-hidden="true">/</span>
        <span style={{ color: "var(--zd-ink)" }}>{b.name}</span>
      </nav>

      <header className="zd-row" style={{ alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
        <Initial name={b.name} large />
        <div className="zd-col" style={{ gap: 10, minWidth: 280 }}>
          <div className="zd-eyebrow">
            Exact Meta page · {b.pageId} · {b.country}
            {timeAgo(b.lastSeenAt) ? ` · updated ${timeAgo(b.lastSeenAt)}` : ""}
          </div>
          <h1 className="zd-h1" style={{ fontWeight: 600, fontSize: 44 }}>
            {b.name}
          </h1>
          <p className="zd-verdict">{b.verdict}</p>
        </div>
        <div className="zd-row" style={{ flexWrap: "wrap" }}>
          <Link href={adsHref} className="zd-btn">
            All {formatInt(b.total)} ads
          </Link>
          <button
            type="button"
            className="zd-btn zd-btn-primary"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("zooptrack:ask-zwirk", {
                  detail: `${b.name}: ${b.verdict} Write a counter-ad brief for my brand: hook, offer, format, language and a 20-second script outline.`,
                }),
              )
            }
          >
            Counter-brief
          </button>
        </div>
      </header>

      {coverage ? (
        <section className="zd-card" aria-label="Coverage" style={{ flexDirection: "row", alignItems: "center", gap: 24, flexWrap: "wrap", padding: "18px 22px" }}>
          <div className="zd-col" style={{ gap: 2, flex: "0 0 200px" }}>
            <span className="zd-muted" style={{ fontSize: 13 }}>
              Meta Ad Library shows
            </span>
            <span className="zd-num" style={{ fontSize: 28 }}>
              <CountUp value={coverage.meta} /> {coverage.label} ads
            </span>
          </div>
          <div className="zd-col" style={{ gap: 8, minWidth: 240 }}>
            <div className="zd-bar" style={{ height: 12 }} role="img" aria-label={`Zooptrack holds ${pct(coverage.held, coverage.meta)}% of Meta's count`}>
              <GrowBar pct={pct(coverage.held, coverage.meta)} delay={0.1} />
            </div>
            <div className="zd-row zd-muted" style={{ fontSize: 13 }}>
              <span>
                Zooptrack holds {formatInt(coverage.held)} · {Math.min(100, pct(coverage.held, coverage.meta))}%
              </span>
              <span style={{ marginLeft: "auto" }}>{pct(coverage.held, coverage.meta) < 90 ? "The rest is read in the nightly pass" : "In sync with Meta"}</span>
            </div>
          </div>
          <span className="zd-pill zd-pill-good">Source-checked</span>
        </section>
      ) : null}

      <div className="zd-grid-5">
        <Rise i={0} className="zd-card" style={{ gap: 4, padding: 18 }}>
          <span className="zd-num"><CountUp value={b.total} /></span>
          <span className="zd-muted" style={{ fontSize: 13 }}>ads on record</span>
        </Rise>
        <Rise i={1} className="zd-card" style={{ gap: 4, padding: 18 }}>
          <span className="zd-num" style={{ color: "var(--zd-accent)" }}><CountUp value={b.new7} prefix="+" /></span>
          <span className="zd-muted" style={{ fontSize: 13 }}>launched in 7 days</span>
        </Rise>
        <Rise i={2} className="zd-card" style={{ gap: 4, padding: 18 }}>
          <span className="zd-num"><CountUp value={b.new30} /></span>
          <span className="zd-muted" style={{ fontSize: 13 }}>launched in 30 days</span>
        </Rise>
        <Rise i={3} className="zd-card" style={{ gap: 4, padding: 18 }}>
          <span className="zd-num"><CountUp value={b.videoShare} suffix="%" /></span>
          <span className="zd-muted" style={{ fontSize: 13 }}>
            video ({formatInt(b.formats.video)} of {formatInt(b.total)})
          </span>
        </Rise>
        <Rise i={4} className="zd-card" style={{ gap: 4, padding: 18 }}>
          <span className="zd-num">{b.longestLive ? `${b.longestLive.days}d` : "—"}</span>
          <span className="zd-muted" style={{ fontSize: 13 }}>longest still running</span>
        </Rise>
      </div>

      <div className="zd-wrap">
        <div className="zd-col">
          <section className="zd-card" aria-labelledby="launch-title">
            <div className="zd-row">
              <h2 id="launch-title" className="zd-h3">
                Launches, last 14 days
              </h2>
              <span className="zd-muted" style={{ marginLeft: "auto", fontSize: 13 }}>
                {formatInt(b.launches14.reduce((a, c) => a + c, 0))} new ads
              </span>
            </div>
            <div className="zd-spark" role="img" aria-label={`New ads per day: ${b.launches14.join(", ")}`}>
              {b.launches14.map((n, i) => (
                <SparkBar key={i} i={i} className={n ? "" : "is-zero"} height={`${Math.max(4, Math.round((n / maxDay) * 100))}%`} title={`${n} new`} />
              ))}
            </div>
            <div className="zd-row zd-muted" style={{ fontFamily: "var(--zd-mono)", fontSize: 12 }}>
              <span>14 days ago</span>
              <span style={{ marginLeft: "auto" }}>Today</span>
            </div>
          </section>

          <section className="zd-card" aria-labelledby="changed-title">
            <div className="zd-row">
              <h2 id="changed-title" className="zd-h3">
                What changed
              </h2>
              <Link href={adsHref} style={{ marginLeft: "auto", fontSize: 14, fontWeight: 600 }}>
                Browse all ads →
              </Link>
            </div>
            <ol className="zd-timeline">
              <li>
                <time>7 days</time>
                <div className="zd-col" style={{ gap: 4 }}>
                  <strong>{b.new7 ? `${formatInt(b.new7)} new ${b.new7 === 1 ? "ad" : "ads"} launched` : "No new ads launched"}</strong>
                  <span className="zd-muted" style={{ fontSize: 14 }}>
                    {b.leadHook && b.new7 ? `Most repeated hook: “${b.leadHook.text}” (${b.leadHook.count}).` : `${formatInt(b.active)} ads live in total.`}
                  </span>
                </div>
              </li>
              {(b.changed ?? []).slice(0, 3).map((c) => (
                <li key={`${c.creativeId}-${c.kind}`}>
                  <time>{timeAgo(c.at)}</time>
                  <div className="zd-col" style={{ gap: 4 }}>
                    <strong>{changeTitle(c)}</strong>
                    <span className="zd-muted" style={{ fontSize: 14 }}>
                      On a live ad{c.evidence?.hook ? `: “${c.evidence.hook}”` : ""}.
                    </span>
                  </div>
                </li>
              ))}
              {b.landing && b.landing.checked > 0 ? (
                <li>
                  <time>Pages</time>
                  <div className="zd-col" style={{ gap: 4 }}>
                    <strong>
                      {b.landing.mismatches
                        ? `${formatInt(b.landing.mismatches)} of ${formatInt(b.landing.checked)} checked ads promise a deal their page doesn't show`
                        : `Checked ${formatInt(b.landing.checked)} ads against their landing pages: offers match`}
                    </strong>
                    <span className="zd-muted" style={{ fontSize: 14 }}>
                      {b.landing.example?.adOffer ? `For example the ad says “${b.landing.example.adOffer}”${b.landing.example.pageTitle ? ` but “${b.landing.example.pageTitle}” shows something else` : ""}. ` : ""}
                      {b.landing.pricePoints.length ? `Prices on their pages: ${b.landing.pricePoints.map((p) => `₹${formatInt(p)}`).join(", ")}.` : ""}
                    </span>
                  </div>
                </li>
              ) : null}
              {b.offers.length ? (
                <li>
                  <time>{b.new7 ? "7 days" : "Live"}</time>
                  <div className="zd-col" style={{ gap: 4 }}>
                    <strong>Offers in use</strong>
                    <span className="zd-row" style={{ flexWrap: "wrap", gap: 8 }}>
                      {b.offers.map((o) => (
                        <span key={o.type} className="zd-chip zd-chip-warm">
                          {o.label} · {o.count}
                        </span>
                      ))}
                    </span>
                  </div>
                </li>
              ) : null}
              {staying ? (
                <li>
                  <time>Ongoing</time>
                  <div className="zd-col" style={{ gap: 4 }}>
                    <strong>“{staying.hook}” still live after {staying.days} days</strong>
                    <span className="zd-muted" style={{ fontSize: 14 }}>
                      Their longest-running live ad. A long run usually means it keeps paying back (heuristic).
                    </span>
                  </div>
                </li>
              ) : null}
            </ol>
          </section>

          <section className="zd-card" aria-labelledby="patterns-title">
            <div className="zd-row">
              <h2 id="patterns-title" className="zd-h3">
                Creative patterns
              </h2>
              <span className="zd-pill zd-pill-steady" style={{ marginLeft: "auto" }}>
                AI · {formatInt(b.patterns.decoded)} of {formatInt(b.patterns.live)} live ads read
              </span>
            </div>
            {b.patterns.decoded ? (
              <dl className="zd-decoded">
                {PATTERN_KEYS.map((key) => {
                  const items = b.patterns.top.filter((p) => p.key === key);
                  return (
                    <div key={key}>
                      <dt>{ELEMENT_LABEL[key]}</dt>
                      <dd>{items.length ? items.map((p) => `${p.label} ${p.share}%`).join(" · ") : "—"}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="zd-muted" style={{ margin: 0, fontSize: 14 }}>
                The AI decoder hasn’t read this brand’s ads yet. It labels hook type, angle, persona, visual style and language for every live ad, a few at a time.
              </p>
            )}
          </section>

          <section className="zd-col" aria-labelledby="worth-title" style={{ gap: 14 }}>
            <h2 id="worth-title" className="zd-h3">
              Ads worth your time
            </h2>
            <div className="zd-grid-4">
              {[...(staying ? [staying] : []), ...b.newest.filter((ad) => ad.id !== staying?.id)].slice(0, 4).map((ad, i) => (
                <EvidenceTile key={ad.id} ad={ad} index={i} brand={b.name} pageId={b.pageId} />
              ))}
            </div>
          </section>
        </div>

        <aside className="zd-aside">
          <section className="zd-card" aria-labelledby="format-title">
            <h2 id="format-title" className="zd-h3">
              How they advertise
            </h2>
            <div className="zd-eyebrow">Format · all {formatInt(b.total)} ads</div>
            <div className="zd-stack" role="img" aria-label={`Video ${b.formats.video}, image ${b.formats.image}, carousel ${b.formats.carousel}`}>
              <span style={{ width: `${pct(b.formats.video, b.total)}%` }} />
              <span style={{ width: `${pct(b.formats.image, b.total)}%` }} />
              <span style={{ width: `${pct(b.formats.carousel, b.total)}%` }} />
            </div>
            <div className="zd-legend">
              <span className="zd-row">
                <span>
                  <i style={{ background: "var(--zd-ink)" }} />
                  Video
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--zd-mono)" }}>{formatInt(b.formats.video)}</span>
              </span>
              <span className="zd-row">
                <span>
                  <i style={{ background: "var(--zd-accent)" }} />
                  Image
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--zd-mono)" }}>{formatInt(b.formats.image)}</span>
              </span>
              <span className="zd-row">
                <span>
                  <i style={{ background: "#c9c3b3" }} />
                  Carousel
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--zd-mono)" }}>{formatInt(b.formats.carousel)}</span>
              </span>
            </div>
          </section>
          {b.vsYou ? (
            <section className="zd-card" aria-labelledby="vs-title">
              <h2 id="vs-title" className="zd-h3">
                {b.name} vs you
              </h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--zd-muted)" }}>
                    <th scope="col" style={{ fontWeight: 500, padding: "6px 0" }}>
                      <span className="zd-sr">Measure</span>
                    </th>
                    <th scope="col" style={{ fontWeight: 600, padding: "6px 8px" }}>{b.name}</th>
                    <th scope="col" style={{ fontWeight: 600, padding: "6px 0" }}>{b.vsYou.you.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["New ads, 7 days", formatInt(b.new7), formatInt(b.vsYou.you.new7)],
                    ["Live ads", formatInt(b.active), formatInt(b.vsYou.you.active)],
                    ["Video share", `${b.videoShare}%`, `${b.vsYou.you.videoShare}%`],
                    ["Lead offer", b.offers[0]?.label ?? "—", b.vsYou.you.topOffer ?? "—"],
                    ["Top angle (AI)", topOf(b.patterns, "angle"), topOf(b.vsYou.you.patterns, "angle")],
                    ["Top hook (AI)", topOf(b.patterns, "hookType"), topOf(b.vsYou.you.patterns, "hookType")],
                  ].map(([label, them, you]) => (
                    <tr key={label} style={{ borderTop: "1px solid var(--zd-line-2)" }}>
                      <th scope="row" style={{ textAlign: "left", fontWeight: 400, color: "var(--zd-muted)", padding: "8px 0" }}>
                        {label}
                      </th>
                      <td style={{ padding: "8px" }}>{them}</td>
                      <td style={{ padding: "8px 0" }}>{you}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : (
            <section className="zd-card zd-card-dark" aria-labelledby="vs-title">
              <h2 id="vs-title" className="zd-h3">
                How does your brand compare?
              </h2>
              <p className="zd-muted" style={{ margin: 0, fontSize: 14 }}>
                Add your brand on Today. Every rival page then shows launches, offers, formats and AI patterns side by side with yours.
              </p>
              <Link href="/today" className="zd-btn" style={{ alignSelf: "flex-start" }}>
                Add my brand
              </Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
