"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";

type Suggestion = { pageId: string; label: string; category?: string | null; profileImageUrl?: string | null };

const QUICK = ["Mamaearth", "Minimalist", "Plum", "Foxtale", "Sugar Cosmetics", "The Derma Co", "Bombay Shaving Company", "Traya"];

/**
 * Search a brand (indexed Meta pages), watch it, and start its first
 * collection. Watching = the nightly refresh + Today feed + Monday report.
 */
export function RivalPicker({ onChanged, compact = false }: { onChanged: () => void; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Record<string, "adding" | "added" | "error">>({});
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      try {
        const url = `/api/ad-intelligence/autocomplete?q=${encodeURIComponent(q)}&country=IN`;
        let response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (response.status >= 500 && !controller.signal.aborted) response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const data = (await response.json().catch(() => ({}))) as { advertisers?: Suggestion[] };
        if (!controller.signal.aborted) setResults((data.advertisers ?? []).filter((s) => /^\d+$/.test(String(s.pageId ?? ""))).slice(0, 6));
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const watch = async (s: Suggestion) => {
    setAdded((m) => ({ ...m, [s.pageId]: "adding" }));
    try {
      const response = await fetch(`/api/ad-intelligence/advertiser/${encodeURIComponent(s.pageId)}?country=IN`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: "IN" }),
      });
      if (!response.ok) throw new Error("watch failed");
      // Start the first read now; the nightly pass keeps it fresh.
      const refresh = new URL("/api/ad-intelligence/refresh", window.location.origin);
      refresh.searchParams.set("q", s.label);
      refresh.searchParams.set("country", "IN");
      refresh.searchParams.set("mode", "advertiser");
      refresh.searchParams.set("pageId", s.pageId);
      void fetch(refresh, { method: "POST", cache: "no-store" }).catch(() => undefined);
      setAdded((m) => ({ ...m, [s.pageId]: "added" }));
      onChanged();
    } catch {
      setAdded((m) => ({ ...m, [s.pageId]: "error" }));
    }
  };

  return (
    <div className="zd-col" style={{ gap: 14 }}>
      <label htmlFor={compact ? "rival-search-compact" : "rival-search"} className="zd-h3" style={compact ? { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } : undefined}>
        Search a brand
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={compact ? "rival-search-compact" : "rival-search"}
          className="zd-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a brand: Mamaearth, boAt, Minimalist…"
          autoComplete="off"
        />
        {loading ? <Loader2 size={16} className="zd-spin" style={{ position: "absolute", right: 14, top: 16 }} aria-label="Searching" /> : null}
      </div>
      {!query && !compact ? (
        <div className="zd-row" style={{ flexWrap: "wrap", gap: 8 }}>
          {QUICK.map((name) => (
            <button key={name} type="button" className="zd-chip" style={{ border: 0, cursor: "pointer", font: "inherit", fontSize: 13 }} onClick={() => setQuery(name)}>
              {name}
            </button>
          ))}
        </div>
      ) : null}
      {results.length ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((s) => {
            const state = added[s.pageId];
            return (
              <li key={s.pageId} className="zd-row" style={{ padding: "10px 12px", border: "1px solid var(--zd-line)", borderRadius: 12, background: "var(--zd-surface)" }}>
                <span className="zd-avatar" aria-hidden="true">
                  {s.label.charAt(0).toUpperCase()}
                </span>
                <span className="zd-col" style={{ gap: 0 }}>
                  <strong style={{ fontSize: 15 }}>{s.label}</strong>
                  <span className="zd-muted" style={{ fontSize: 13 }}>
                    {s.category ? `${s.category} · ` : ""}Meta page {s.pageId}
                  </span>
                </span>
                <button type="button" className={`zd-btn${state === "added" ? "" : " zd-btn-primary"}`} disabled={state === "adding" || state === "added"} onClick={() => void watch(s)}>
                  {state === "added" ? <Check size={15} aria-hidden="true" /> : state === "adding" ? <Loader2 size={15} className="zd-spin" aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
                  {state === "added" ? "Watching" : state === "error" ? "Try again" : "Watch"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : query.trim().length >= 2 && !loading ? (
        <p className="zd-muted" style={{ margin: 0, fontSize: 14 }}>
          No indexed page yet for “{query.trim()}”. Search it once in Discover ads and Zooptrack will find its Meta page.
        </p>
      ) : null}
    </div>
  );
}
