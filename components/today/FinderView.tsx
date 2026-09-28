"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Loader2 } from "lucide-react";

import { FINDER_KEYS, type FinderKey } from "@/lib/decode/finder";
import { ELEMENT_LABEL, ELEMENTS, valueLabel, type Decoded } from "@/lib/decode/taxonomy";

import { Rise } from "./motion";
import { safeImage, timeAgo } from "./parts";

type FoundAd = {
  id: string;
  advertiser_id: string | null;
  advertiser_name: string | null;
  creative_type: string | null;
  headline: string | null;
  primary_text: string | null;
  offer: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  first_seen_at: string | null;
  labels: Decoded | null;
};

const PRESETS: Array<{ label: string; set: Partial<Record<FinderKey, string>> & { offer?: "1" } }> = [
  { label: "Hinglish ads with an offer", set: { language: "hinglish", offer: "1" } },
  { label: "UGC selfie videos", set: { visualStyle: "ugc_selfie" } },
  { label: "Problem-first hooks", set: { hookType: "problem_first" } },
  { label: "Festive campaigns", set: { angle: "festive" } },
];

/** Find live ads by what they say and show, using the AI labels. */
export function FinderView() {
  const [labels, setLabels] = useState<Partial<Record<FinderKey, string>>>({});
  const [offer, setOffer] = useState<"" | "1" | "0">("");
  const [scope, setScope] = useState<"all" | "watched">("all");
  const [ads, setAds] = useState<FoundAd[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(labels)) if (v) p.set(k, v);
    if (offer) p.set("offer", offer);
    if (scope === "watched") p.set("scope", "watched");
    return p.toString();
  }, [labels, offer, scope]);
  const empty = !Object.values(labels).some(Boolean) && !offer;

  useEffect(() => {
    if (empty) {
      setAds(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/ad-intelligence/finder?${query}`, { signal: controller.signal });
        const json = (await res.json()) as { success: boolean; ads?: FoundAd[]; error?: string; note?: string };
        if (!json.success) throw new Error(json.error ?? "Search failed.");
        setAds(json.ads ?? []);
        if (json.note) setError(json.note);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Search failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, empty]);

  const applyPreset = (set: (typeof PRESETS)[number]["set"]) => {
    const { offer: o, ...rest } = set;
    setLabels(rest);
    setOffer(o ?? "");
  };

  return (
    <div className="zd-col" style={{ gap: 24 }}>
      <Rise className="zd-col" style={{ gap: 10 }}>
        <span className="zd-eyebrow">Ad finder</span>
        <h1 className="zd-h1">Find ads by what they say and show.</h1>
        <p className="zd-lede">Every ad is labelled by AI: hook, angle, audience, language, emotion and visual style. Combine labels to find patterns across brands.</p>
      </Rise>

      <section className="zd-card" aria-label="Filters">
        <div className="zd-row" style={{ flexWrap: "wrap", gap: 8 }}>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="zd-chip" style={{ cursor: "pointer", border: 0 }} onClick={() => applyPreset(p.set)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="zd-grid-4" style={{ marginTop: 6 }}>
          {FINDER_KEYS.map((key) => (
            <label key={key} className="zd-col" style={{ gap: 4, fontSize: 13 }}>
              <span className="zd-muted">{ELEMENT_LABEL[key]}</span>
              <select className="zd-select" value={labels[key] ?? ""} onChange={(e) => setLabels((prev) => ({ ...prev, [key]: e.target.value || undefined }))}>
                <option value="">Any</option>
                {(ELEMENTS[key] as readonly string[]).map((v) => (
                  <option key={v} value={v}>
                    {valueLabel(v)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="zd-col" style={{ gap: 4, fontSize: 13 }}>
            <span className="zd-muted">Offer</span>
            <select className="zd-select" value={offer} onChange={(e) => setOffer(e.target.value as typeof offer)}>
              <option value="">Any</option>
              <option value="1">Has an offer</option>
              <option value="0">No offer</option>
            </select>
          </label>
          <label className="zd-col" style={{ gap: 4, fontSize: 13 }}>
            <span className="zd-muted">Brands</span>
            <select className="zd-select" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="all">All indexed brands</option>
              <option value="watched">Only my rivals</option>
            </select>
          </label>
        </div>
        {!empty ? (
          <button type="button" className="zd-btn" style={{ alignSelf: "flex-start" }} onClick={() => { setLabels({}); setOffer(""); }}>
            Clear
          </button>
        ) : null}
      </section>

      {empty ? <p className="zd-muted">Pick a label or a preset to start.</p> : null}
      {loading ? (
        <p className="zd-row zd-muted" role="status">
          <Loader2 size={16} className="zd-spin" aria-hidden="true" /> Searching…
        </p>
      ) : null}
      {error ? <p className="zd-muted" role="status">{error}</p> : null}
      {ads && !loading ? (
        ads.length ? (
          <section aria-label="Matching ads" className="zd-col" style={{ gap: 12 }}>
            <span className="zd-muted" style={{ fontSize: 14 }}>
              {ads.length} live {ads.length === 1 ? "ad" : "ads"} match. Labels are AI estimates.
            </span>
            <div className="zd-grid-4">
              {ads.map((ad, i) => {
                const image = safeImage(ad.thumbnail_url ?? ad.image_url);
                const style: CSSProperties | undefined = image ? { backgroundImage: `url("${image.replace(/"/g, "%22")}")` } : undefined;
                const brand = ad.advertiser_name ?? "Brand";
                const hook = (ad.headline || ad.primary_text || "").replace(/\s+/g, " ").trim().slice(0, 90) || null;
                return (
                  <Link
                    key={ad.id}
                    href={ad.advertiser_id ? `/adspy?q=${encodeURIComponent(brand)}&pid=${encodeURIComponent(ad.advertiser_id)}` : "/adspy"}
                    className={`zd-tile tone-${(i % 4) + 1}`}
                    style={style}
                    aria-label={`${brand}: ${hook ?? "ad"}`}
                  >
                    <span className="zd-tile-meta">
                      {brand} · {ad.creative_type ?? "ad"}
                      {ad.first_seen_at ? ` · ${timeAgo(ad.first_seen_at)}` : ""}
                    </span>
                    <span className="zd-tile-hook">{hook ?? "No copy captured"}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : (
          <p className="zd-muted">No live ads match yet. Labels fill in as ads are analysed; try fewer labels.</p>
        )
      ) : null}
    </div>
  );
}
