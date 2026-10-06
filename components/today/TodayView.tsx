"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { TodayData } from "@/lib/today/load";

import { EvidenceTile, formatInt, Initial, MovePill, timeAgo } from "./parts";
import { GrowBar, Rise } from "./motion";
import { MyBrandCard } from "./MyBrandCard";
import { PlanBanner } from "./PlanBanner";
import { RivalPicker } from "./RivalPicker";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: TodayData };

const ZWIRK_PROMPTS = [
  "Which of my rivals' ads has run the longest, and why might it work?",
  "Write 3 counter-offers to my biggest rival's current offer.",
  "Compare my rivals' formats this week.",
];

export function TodayView() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetch("/api/today", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { success: boolean; error?: string } & Partial<TodayData>;
        if (!alive) return;
        if (!response.ok || !body.success) throw new Error(body.error || "Could not load Today.");
        setState({ status: "ready", data: body as TodayData });
      })
      .catch((error: unknown) => alive && setState({ status: "error", message: error instanceof Error ? error.message : "Could not load Today." }));
    return () => {
      alive = false;
    };
  }, [version]);

  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  if (state.status === "loading") {
    return (
      <div className="zd-col" aria-busy="true" aria-label="Loading today's rival moves">
        <div className="zd-skel" style={{ height: 120 }} />
        <div className="zd-skel" style={{ height: 420 }} />
        <div className="zd-grid-2">
          <div className="zd-skel" style={{ height: 200 }} />
          <div className="zd-skel" style={{ height: 200 }} />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="zd-col">
        <p className="zd-error" role="alert">
          {state.message}
        </p>
        <button type="button" className="zd-btn" onClick={reload} style={{ alignSelf: "flex-start" }}>
          Try again
        </button>
      </div>
    );
  }

  const { data } = state;

  if (data.watchedCount === 0) {
    return (
      <div className="zd-col" style={{ maxWidth: 880, gap: 40 }}>
        <header className="zd-col" style={{ gap: 14 }}>
          <span className="zd-eyebrow">Get started, about a minute</span>
          <h1 className="zd-h1">Know what your rivals ran this week.</h1>
          <p className="zd-lede">Two steps. Zooptrack reads your rivals' Meta ads every night and tells you what changed, here and in an email on the schedule you choose.</p>
        </header>
        <section className="zd-lead" aria-labelledby="step-1">
          <span className="zd-rank" aria-hidden="true">1</span>
          <div className="zd-lead-body">
            <h2 className="zd-h3" id="step-1">
              Your brand
            </h2>
            <MyBrandCard />
          </div>
        </section>
        <section className="zd-lead" aria-labelledby="step-2">
          <span className="zd-rank" aria-hidden="true">2</span>
          <div className="zd-lead-body">
            <h2 className="zd-h3" id="step-2">
              Rivals to watch, up to 3 to start
            </h2>
            <RivalPicker onChanged={reload} />
          </div>
        </section>
      </div>
    );
  }

  const [lead, ...rest] = data.moves;
  const freshest = data.rivals.map((r) => r.lastSeenAt).filter((v): v is string => Boolean(v)).sort().pop() ?? null;
  const updated = timeAgo(freshest);
  const maxNew = Math.max(1, ...data.rivals.map((r) => r.new7));

  return (
    <>
      <PlanBanner />
      <header className="zd-masthead">
        <div className="zd-col" style={{ gap: 14 }}>
          <p className="zd-dateline" style={{ margin: 0 }}>
            <span>{dateLabel}</span>
            <span>
              {data.watchedCount} {data.watchedCount === 1 ? "rival" : "rivals"} watched
            </span>
            {updated ? <span>Data updated {updated}</span> : null}
          </p>
          <h1 className="zd-h1" style={{ maxWidth: "24ch" }}>
            {data.headline}
          </h1>
          <p className="zd-lede">
            {data.moves.length ? `${data.moves.length} ${data.moves.length === 1 ? "move" : "moves"} from your rivals. Each one opens the ads that prove it.` : "No moves yet: your rivals' ads are still being collected."}
          </p>
        </div>
        <div className="zd-row">
          <Link href="/today/report" className="zd-btn">
            Preview report
          </Link>
          <a href="#add-rival" className="zd-btn zd-btn-primary">
            Add a rival
          </a>
        </div>
      </header>

      <div className="zd-wrap">
        <div className="zd-col" style={{ gap: 48 }}>
          {lead ? (
            <Rise as="article" i={0} className="zd-lead" aria-labelledby="move-1">
              <span className="zd-rank" aria-hidden="true">
                1
              </span>
              <div className="zd-lead-body">
                <div className="zd-byline">
                  <Initial name={lead.brand} />
                  <span>{lead.brand}</span>
                  <MovePill kind={lead.kind} label={lead.label} />
                </div>
                <h2 id="move-1" className="zd-h2">
                  {lead.title}
                </h2>
                <p style={{ margin: 0, color: "var(--zt-text-secondary)", maxWidth: "66ch" }}>{lead.detail}</p>
                {lead.evidence.length ? (
                  <div className="zd-col" style={{ gap: 8 }}>
                    <span className="zd-eyebrow">The ads behind it</span>
                    <div className="zd-grid-3">
                      {lead.evidence.map((ad, i) => (
                        <EvidenceTile key={ad.id} ad={ad} index={i} brand={lead.brand} pageId={lead.pageId} />
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="zd-todo">
                  <b>What to do</b>
                  <p>{lead.action}</p>
                </div>
                <div className="zd-row" style={{ flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="zd-btn zd-btn-ink"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("zooptrack:ask-zwirk", {
                          detail: `${lead.brand}: ${lead.title} ${lead.detail} Write a counter-ad brief for my brand: hook, offer, format, language and a 20-second script outline.`,
                        }),
                      )
                    }
                  >
                    Brief a counter-ad
                  </button>
                  <Link href={`/today/brand/${lead.pageId}`} className="zd-btn">
                    Open {lead.brand}
                  </Link>
                </div>
              </div>
            </Rise>
          ) : (
            <div className="zd-empty">
              <h2 className="zd-h3">Collecting your rivals' ads</h2>
              <p className="zd-muted" style={{ margin: 0 }}>
                Moves appear after the first nightly read. Open a rival from the list to start collecting now.
              </p>
            </div>
          )}

          {rest.length ? (
            <ol className="zd-moves" aria-label="More moves">
              {rest.map((move, i) => (
                <li key={`${move.pageId}-${move.kind}`} className="zd-move">
                  <span className="zd-rank zd-rank-sm" aria-hidden="true">
                    {i + 2}
                  </span>
                  <div className="zd-col" style={{ gap: 8 }}>
                    <div className="zd-byline">
                      <span>{move.brand}</span>
                      <MovePill kind={move.kind} label={move.label} />
                    </div>
                    <h3>{move.title}</h3>
                    <p>{move.detail}</p>
                    <p style={{ color: "var(--zt-text-primary)" }}>
                      <b style={{ color: "var(--zt-insight)" }}>What to do:</b> {move.action}
                    </p>
                  </div>
                  <div className="zd-move-side">
                    <Link href={`/today/brand/${move.pageId}`}>See the ads</Link>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          <section id="add-rival" className="zd-section" aria-labelledby="add-rival-title">
            <h2 id="add-rival-title" className="zd-h3">
              Watch another rival
            </h2>
            <RivalPicker onChanged={reload} compact />
          </section>
        </div>

        <aside className="zd-aside">
          <section className="zd-section" aria-labelledby="new-ads-title">
            <h2 id="new-ads-title" className="zd-h3">
              New ads this week
            </h2>
            <div className="zd-col" style={{ gap: 14 }}>
              {data.rivals.map((rival) => (
                <Link key={rival.pageId} href={`/today/brand/${rival.pageId}`} className="zd-col" style={{ gap: 6, color: "var(--zt-text-primary)" }}>
                  <span className="zd-row" style={{ alignItems: "baseline" }}>
                    <span style={{ fontWeight: 600 }}>{rival.name}</span>
                    <span className="zd-figure" style={{ marginLeft: "auto", fontSize: 20 }}>
                      {rival.total === 0 ? <span className="zd-muted" style={{ fontSize: 13, fontFamily: "var(--zt-font-text)", fontWeight: 400 }}>collecting…</span> : formatInt(rival.new7)}
                    </span>
                  </span>
                  <span className="zd-bar" aria-hidden="true">
                    <GrowBar pct={Math.round((rival.new7 / maxNew) * 100)} delay={0.2} />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="zd-section" aria-labelledby="my-brand-title">
            <h2 id="my-brand-title" className="zd-h3">
              Your brand
            </h2>
            <MyBrandCard compact />
          </section>

          <section className="zd-ink" aria-labelledby="zwirk-title">
            <div className="zd-col" style={{ gap: 4 }}>
              <h2 id="zwirk-title" className="zd-h3">
                Ask ZWIRK
              </h2>
              <p className="zd-muted" style={{ margin: 0, fontSize: 14 }}>
                Answers from the same data you see here.
              </p>
            </div>
            <div className="zd-col" style={{ gap: 0 }}>
              {ZWIRK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="zd-ask"
                  onClick={() => window.dispatchEvent(new CustomEvent("zooptrack:ask-zwirk", { detail: prompt }))}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>

          <section className="zd-col" style={{ gap: 6 }} aria-labelledby="inbox-title">
            <h2 id="inbox-title" className="zd-h3">
              This lands in your inbox
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: "var(--zt-text-secondary)" }}>The same moves, by email, daily or weekly. You choose when.</p>
            <Link href="/today/report" style={{ fontWeight: 600, fontSize: 14 }}>
              Set up the email
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
