"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, TrendingUp, X } from "lucide-react";

import { applyTargetParams, formatInt, type Facets, type SearchTarget } from "./workspace-utils";

type Column = { target: SearchTarget; facets: Facets | null; error?: boolean };

function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function bucketCount(facets: Facets | null, dim: "format" | "status", value: string): number {
  return facets?.[dim].find((b) => b.value === value)?.count ?? 0;
}

function topLabels(facets: Facets | null, dim: "language" | "region", n = 3): string[] {
  return (facets?.[dim] ?? []).slice(0, n).map((b) => b.label);
}

/** Plain-language differences, computed only from observed counts. */
function differences(columns: Column[]): string[] {
  const ready = columns.filter((c) => c.facets && c.facets.total > 0) as Array<Column & { facets: Facets }>;
  if (ready.length < 2) return [];
  const out: string[] = [];
  const name = (c: Column) => c.target.query;

  const pace = [...ready].sort((a, b) => b.facets.momentum.launched30d - a.facets.momentum.launched30d);
  const [fast, slow] = [pace[0], pace[pace.length - 1]];
  if (fast.facets.momentum.launched30d > 0 && fast.facets.momentum.launched30d !== slow.facets.momentum.launched30d) {
    const a = fast.facets.momentum.launched30d;
    const b = slow.facets.momentum.launched30d;
    const ratio = b >= 5 ? a / b : null;
    out.push(
      ratio && ratio >= 1.5 && ratio < 10
        ? `${name(fast)} is testing about ${Math.round(ratio)}× as many new ads as ${name(slow)} this month (${formatInt(a)} vs ${formatInt(b)}).`
        : `${name(fast)} launched ${formatInt(a)} new ads this month; ${name(slow)} launched ${formatInt(b)}.`,
    );
  }

  const video = ready.map((c) => ({ c, v: share(bucketCount(c.facets, "format", "video"), c.facets.total) }));
  video.sort((a, b) => b.v - a.v);
  if (video[0].v - video[video.length - 1].v >= 20) {
    out.push(`${name(video[0].c)} leans on video (${video[0].v}% of ads); ${name(video[video.length - 1].c)} uses video in ${video[video.length - 1].v}%.`);
  }

  const langSets = ready.map((c) => new Set(c.facets.language.filter((l) => l.count >= Math.max(3, c.facets.total * 0.05)).map((l) => l.label)));
  ready.forEach((c, i) => {
    const only = [...langSets[i]].filter((l) => langSets.every((set, j) => j === i || !set.has(l)));
    if (only.length) out.push(`Only ${name(c)} is advertising in ${only.slice(0, 2).join(" and ")} — an opening if your buyers speak it.`);
  });

  const active = ready.map((c) => ({ c, a: share(bucketCount(c.facets, "status", "active"), c.facets.total) }));
  active.sort((a, b) => b.a - a.a);
  if (active[0].a - active[active.length - 1].a >= 25) {
    out.push(`${active[0].a}% of ${name(active[0].c)}'s indexed ads are live now, versus ${active[active.length - 1].a}% for ${name(active[active.length - 1].c)}.`);
  }

  return out.slice(0, 5);
}

export function CompareView({ targets, onClose, onRemove }: { targets: SearchTarget[]; onClose: () => void; onRemove: (t: SearchTarget) => void }) {
  const [columns, setColumns] = useState<Column[]>(() => targets.map((target) => ({ target, facets: null })));
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let alive = true;
    setColumns(targets.map((target) => ({ target, facets: null })));
    targets.forEach((target, index) => {
      const url = new URL("/api/ad-intelligence/facets", window.location.origin);
      applyTargetParams(url, target);
      fetch(url, { cache: "no-store" })
        .then((r) => r.json())
        .then((data: { success?: boolean; facets?: Facets | null }) => {
          if (!alive) return;
          setColumns((cols) => cols.map((c, i) => (i === index ? { ...c, facets: data.facets ?? { total: 0, capped: false, status: [], format: [], language: [], region: [], momentum: { weeks: [], launched7d: 0, launched30d: 0, datedCreatives: 0 } }, error: !data.success } : c)));
        })
        .catch(() => alive && setColumns((cols) => cols.map((c, i) => (i === index ? { ...c, error: true } : c))));
    });
    return () => {
      alive = false;
    };
  }, [targets]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const diffs = useMemo(() => differences(columns), [columns]);
  const loading = columns.some((c) => !c.facets && !c.error);

  const rows: Array<{ label: string; value: (c: Column) => string }> = [
    { label: "Ads indexed", value: (c) => formatInt(c.facets?.total ?? 0) },
    { label: "Running now", value: (c) => formatInt(bucketCount(c.facets, "status", "active")) },
    { label: "New in last 30 days", value: (c) => formatInt(c.facets?.momentum.launched30d ?? 0) },
    { label: "New in last 7 days", value: (c) => formatInt(c.facets?.momentum.launched7d ?? 0) },
    { label: "Video share", value: (c) => (c.facets ? `${share(bucketCount(c.facets, "format", "video"), c.facets.total)}%` : "–") },
    { label: "Image share", value: (c) => (c.facets ? `${share(bucketCount(c.facets, "format", "image"), c.facets.total)}%` : "–") },
    { label: "Top languages", value: (c) => topLabels(c.facets, "language").join(", ") || "–" },
    { label: "Top regions", value: (c) => topLabels(c.facets, "region").join(", ") || "–" },
  ];

  const askZwirk = () => {
    const lines = columns
      .filter((c) => c.facets)
      .map((c) => {
        const f = c.facets as Facets;
        return `${c.target.query}: ${f.total} ads, ${share(bucketCount(f, "status", "active"), f.total)}% live, ${f.momentum.launched30d} new in 30 days, ${share(bucketCount(f, "format", "video"), f.total)}% video, languages ${topLabels(f, "language").join("/") || "n/a"}`;
      })
      .join("; ");
    window.dispatchEvent(
      new CustomEvent("zooptrack:ask-zwirk", {
        detail: `Compare these competitors on Meta: ${lines}. Where is each one strong, what gaps do all of them leave open, and what 3 ads should my brand test to win against them?`,
      }),
    );
    onClose();
  };

  return (
    <div className="azs-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="azs-modal azs-compare" role="dialog" aria-modal="true" aria-labelledby="azs-compare-title">
        <div className="azs-modal-head">
          <div>
            <span className="azs-kicker">Compare</span>
            <h2 id="azs-compare-title">
              <TrendingUp size={18} /> {columns.map((c) => c.target.query).join(" vs ")}
            </h2>
          </div>
          <button ref={closeRef} type="button" className="azs-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="azs-compare-body">
          <section className="azs-compare-diffs" aria-label="Key differences">
            <h3>What is different</h3>
            {loading ? (
              <p className="azs-muted">
                <Loader2 size={14} className="azs-spin" /> Reading each brand&apos;s ads…
              </p>
            ) : diffs.length ? (
              <ul>
                {diffs.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : (
              <p className="azs-muted">
                {columns.filter((c) => (c.facets?.total ?? 0) > 0).length >= 2
                  ? "No big differences in launch pace, format, language or live share between these brands."
                  : "Not enough indexed ads yet to call out differences. Refresh each brand first."}
              </p>
            )}
            <p className="azs-fine">Based only on public ads we have indexed. Meta does not publish spend or results.</p>
          </section>

          <div className="azs-compare-table" style={{ gridTemplateColumns: `minmax(120px, 0.8fr) repeat(${columns.length}, minmax(0, 1fr))` }}>
            <div className="azs-compare-corner" />
            {columns.map((c) => (
              <div className="azs-compare-brand" key={`${c.target.query}-${c.target.pageId}`}>
                <strong title={c.target.query}>{c.target.query}</strong>
                <button type="button" className="azs-icon-btn" aria-label={`Remove ${c.target.query}`} onClick={() => onRemove(c.target)}>
                  <X size={13} />
                </button>
              </div>
            ))}
            {rows.map((row) => (
              <div className="azs-compare-row" key={row.label} style={{ display: "contents" }}>
                <div className="azs-compare-label">{row.label}</div>
                {columns.map((c) => (
                  <div className="azs-compare-cell" key={`${row.label}-${c.target.query}`}>
                    {!c.facets && !c.error ? <span className="azs-sk-inline" /> : c.error ? "–" : row.value(c)}
                  </div>
                ))}
              </div>
            ))}
            <div className="azs-compare-label">New ads per week</div>
            {columns.map((c) => {
              const weeks = c.facets?.momentum.weeks ?? [];
              const max = Math.max(1, ...weeks.map((w) => w.launched));
              return (
                <div className="azs-compare-cell" key={`spark-${c.target.query}`}>
                  <div className="azs-spark" aria-label={`${c.target.query} weekly launches`}>
                    {weeks.map((w) => (
                      <span key={w.weekStart} style={{ height: `${Math.max(6, (w.launched / max) * 100)}%` }} className={w.launched ? "" : "is-zero"} title={`${w.weekStart}: ${w.launched}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="azs-modal-actions">
            <button type="button" className="azs-btn azs-btn-primary" onClick={askZwirk} disabled={loading}>
              <Sparkles size={14} /> Ask ZWIRK how to beat them
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

