"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { TodayData } from "@/lib/today/load";

import { EvidenceTile, formatInt, Initial, MovePill } from "./parts";
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
      <div className="zd-col" style={{ maxWidth: 880 }}>
        <div className="zd-eyebrow">Get started · 1 minute</div>
        <h1 className="zd-h1">
          Know what your rivals ran <em style={{ color: "var(--zd-accent)" }}>this week</em>.
        </h1>
        <p className="zd-lede">Pick up to 3 rivals. Zooptrack reads their Meta ads every night and tells you what changed, here and in a Monday email.</p>
        <RivalPicker onChanged={reload} />
      </div>
    );
  }

  const [lead, ...rest] = data.moves;
  const maxNew = Math.max(1, ...data.rivals.map((r) => r.new7));

  return (
    <>
      <header className="zd-row" style={{ alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div className="zd-col" style={{ gap: 10 }}>
          <div className="zd-eyebrow">
            Today · {dateLabel} · {data.watchedCount} {data.watchedCount === 1 ? "rival" : "rivals"} watched
          </div>
          <h1 className="zd-h1">{data.headline}</h1>
          <p className="zd-lede">
            {data.moves.length ? `${data.moves.length} ${data.moves.length === 1 ? "move" : "moves"} from your rivals. Each one opens the ads that prove it.` : "No moves yet: your rivals' ads are still being collected."}
          </p>
        </div>
        <div className="zd-row">
          <Link href="/today/report" className="zd-btn">
            Preview Monday report
          </Link>
          <a href="#add-rival" className="zd-btn zd-btn-primary">
            Add a rival
          </a>
        </div>
      </header>

      <div className="zd-wrap">
        <div className="zd-col">
          {lead ? (
            <article className="zd-card" aria-labelledby="move-1">
              <div className="zd-row">
                <span className="zd-eyebrow">01</span>
                <Initial name={lead.brand} />
                <strong>{lead.brand}</strong>
                <span style={{ marginLeft: "auto" }}>
                  <MovePill kind={lead.kind} label={lead.label} />
                </span>
              </div>
              <h2 id="move-1" className="zd-h2">
                {lead.title}
              </h2>
              <p style={{ margin: 0, color: "var(--zd-ink-2)" }}>{lead.detail}</p>
              {lead.evidence.length ? (
                <div className="zd-col" style={{ gap: 10 }}>
                  <div className="zd-eyebrow">Evidence</div>
                  <div className="zd-grid-3">
                    {lead.evidence.map((ad, i) => (
                      <EvidenceTile key={ad.id} ad={ad} index={i} brand={lead.brand} pageId={lead.pageId} />
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="zd-row zd-divider" style={{ flexWrap: "wrap" }}>
                <p style={{ margin: 0, flex: 1, minWidth: 260, color: "var(--zd-ink-2)" }}>
                  <strong style={{ color: "var(--zd-ink)" }}>What to do:</strong> {lead.action}
                </p>
                <Link href={`/today/brand/${lead.pageId}`} className="zd-btn">
                  Open {lead.brand}
                </Link>
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
              </div>
            </article>
          ) : (
            <div className="zd-empty">
              <h2 className="zd-h3">Collecting your rivals' ads</h2>
              <p className="zd-muted" style={{ margin: 0 }}>
                Moves appear after the first nightly read. Open a rival from the list to start collecting now.
              </p>
            </div>
          )}

          {rest.length ? (
            <div className="zd-grid-2">
              {rest.map((move, i) => (
                <article key={`${move.pageId}-${move.kind}`} className="zd-card">
                  <div className="zd-row">
                    <span className="zd-eyebrow">0{i + 2}</span>
                    <Initial name={move.brand} />
                    <strong>{move.brand}</strong>
                    <span style={{ marginLeft: "auto" }}>
                      <MovePill kind={move.kind} label={move.label} />
                    </span>
                  </div>
                  <h2 className="zd-h2" style={{ fontSize: 24 }}>
                    {move.title}
                  </h2>
                  <p style={{ margin: 0, color: "var(--zd-ink-2)" }}>{move.detail}</p>
                  <p style={{ margin: 0 }}>
                    <strong>What to do:</strong> {move.action}
                  </p>
                  <Link href={`/today/brand/${move.pageId}`} style={{ marginTop: "auto", fontWeight: 600 }}>
                    See the evidence →
                  </Link>
                </article>
              ))}
            </div>
          ) : null}

          <section id="add-rival" className="zd-card" aria-labelledby="add-rival-title">
            <h2 id="add-rival-title" className="zd-h3">
              Watch another rival
            </h2>
            <RivalPicker onChanged={reload} compact />
          </section>
        </div>

        <aside className="zd-aside">
          <section className="zd-card" aria-labelledby="new-ads-title">
            <h2 id="new-ads-title" className="zd-h3">
              New ads this week
            </h2>
            <div className="zd-col" style={{ gap: 12 }}>
              {data.rivals.map((rival) => (
                <Link key={rival.pageId} href={`/today/brand/${rival.pageId}`} className="zd-col" style={{ gap: 6, color: "var(--zd-ink)" }}>
                  <span className="zd-row" style={{ fontSize: 14 }}>
                    <span>{rival.name}</span>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--zd-mono)" }}>{formatInt(rival.new7)}</span>
                  </span>
                  <span className="zd-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round((rival.new7 / maxNew) * 100)}%` }} />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="zd-card zd-card-dark" aria-labelledby="zwirk-title">
            <h2 id="zwirk-title" className="zd-h3">
              Ask ZWIRK
            </h2>
            <p className="zd-muted" style={{ margin: 0, fontSize: 14 }}>
              Reads the same data you see here.
            </p>
            {ZWIRK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="zd-btn"
                style={{ justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left", background: "transparent", color: "inherit", borderColor: "#3a3d45", padding: "10px 14px" }}
                onClick={() => window.dispatchEvent(new CustomEvent("zooptrack:ask-zwirk", { detail: prompt }))}
              >
                {prompt}
              </button>
            ))}
          </section>

          <section className="zd-empty" aria-labelledby="inbox-title">
            <h2 id="inbox-title" className="zd-h3">
              This lands in your inbox
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: "var(--zd-ink-2)" }}>The same moves, every Monday at 9 AM IST.</p>
            <Link href="/today/report" style={{ fontWeight: 600, fontSize: 14 }}>
              See the email →
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
