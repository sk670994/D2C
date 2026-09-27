"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

type OwnBrand = { pageId: string | null; brandName: string | null; websiteUrl: string | null };
type Suggestion = { pageId: string; label: string; category?: string | null };

/**
 * "Your brand": name, store URL and the Meta page it advertises from.
 * With a page set, every rival page gets a "Vs you" comparison.
 */
export function MyBrandCard({ onSaved, compact = false }: { onSaved?: () => void; compact?: boolean }) {
  const [brand, setBrand] = useState<OwnBrand | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [page, setPage] = useState<Suggestion | null>(null);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/today/my-brand", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { brand?: OwnBrand }) => {
        const b = data.brand ?? { pageId: null, brandName: null, websiteUrl: null };
        setBrand(b);
        setName(b.brandName ?? "");
        setWebsite(b.websiteUrl ?? "");
        setEditing(!b.pageId);
      })
      .catch(() => setBrand({ pageId: null, brandName: null, websiteUrl: null }));
  }, []);

  useEffect(() => {
    const q = name.trim();
    if (!editing || q.length < 2 || (page && page.label === q)) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      try {
        const url = `/api/ad-intelligence/autocomplete?q=${encodeURIComponent(q)}&country=IN`;
        let response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (response.status >= 500 && !controller.signal.aborted) response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const data = (await response.json().catch(() => ({}))) as { advertisers?: Suggestion[] };
        if (!controller.signal.aborted) setResults((data.advertisers ?? []).filter((s) => /^\d+$/.test(String(s.pageId ?? ""))).slice(0, 5));
      } catch {
        if (!controller.signal.aborted) setResults([]);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [name, editing, page]);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/today/my-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName: name, websiteUrl: website, pageId: page?.pageId ?? brand?.pageId ?? "" }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string; brand?: OwnBrand };
      if (!response.ok || !data.success) throw new Error(data.error || "Could not save your brand.");
      setBrand(data.brand ?? null);
      setEditing(false);
      onSaved?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your brand.");
    } finally {
      setBusy(false);
    }
  };

  if (!brand) return <div className="zd-skel" style={{ height: compact ? 90 : 180 }} />;

  if (!editing && brand.pageId) {
    return (
      <div className="zd-row" style={{ flexWrap: "wrap" }}>
        <span className="zd-avatar" aria-hidden="true">
          {(brand.brandName ?? "Y").charAt(0).toUpperCase()}
        </span>
        <span className="zd-col" style={{ gap: 0 }}>
          <strong>{brand.brandName ?? "Your brand"}</strong>
          <span className="zd-muted" style={{ fontSize: 13 }}>
            Meta page {brand.pageId} · compared on every rival page
          </span>
        </span>
        <button type="button" className="zd-btn" style={{ marginLeft: "auto" }} onClick={() => setEditing(true)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <form
      className="zd-col"
      style={{ gap: 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className={compact ? "zd-col" : "zd-grid-2"} style={{ gap: 12 }}>
        <label className="zd-col" style={{ gap: 6 }}>
          <span className="zd-h3" style={{ fontSize: 14 }}>
            Your brand
          </span>
          <input
            className="zd-input"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setPage(null);
            }}
            placeholder="e.g. Minimalist"
            autoComplete="off"
            required
          />
        </label>
        <label className="zd-col" style={{ gap: 6 }}>
          <span className="zd-h3" style={{ fontSize: 14 }}>
            Store URL <span className="zd-muted" style={{ fontWeight: 400 }}>(optional)</span>
          </span>
          <input className="zd-input" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="yourbrand.com" autoComplete="url" inputMode="url" />
        </label>
      </div>
      {results.length ? (
        <fieldset style={{ margin: 0, padding: 0, border: 0 }} className="zd-col">
          <legend className="zd-muted" style={{ fontSize: 13, paddingBottom: 6 }}>
            Which Meta page is yours?
          </legend>
          <div className="zd-row" style={{ flexWrap: "wrap", gap: 8 }}>
            {results.map((s) => (
              <button
                key={s.pageId}
                type="button"
                className="zd-btn"
                aria-pressed={page?.pageId === s.pageId}
                style={page?.pageId === s.pageId ? { borderColor: "var(--zd-accent)", background: "var(--zd-accent-soft)" } : undefined}
                onClick={() => {
                  setPage(s);
                  setName(s.label);
                }}
              >
                {page?.pageId === s.pageId ? <Check size={14} aria-hidden="true" /> : null}
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : name.trim().length >= 2 && !page ? (
        <p className="zd-muted" style={{ margin: 0, fontSize: 13 }}>
          No indexed Meta page matches yet. Save anyway: search your brand once in Discover ads and pick it here later.
        </p>
      ) : null}
      {error ? (
        <p className="zd-error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
      <div className="zd-row">
        <button type="submit" className="zd-btn zd-btn-primary" disabled={busy || name.trim().length < 2}>
          {busy ? <Loader2 size={15} className="zd-spin" aria-hidden="true" /> : null}
          Save my brand
        </button>
        {brand.pageId ? (
          <button type="button" className="zd-btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
