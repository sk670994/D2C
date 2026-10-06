"use client";

import { useState } from "react";

import { describePrefs, hourLabel, WEEKDAYS, type ReportFrequency, type ReportPrefs } from "@/lib/today/report-schedule";

const FREQUENCIES: Array<{ value: ReportFrequency; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "off", label: "Off" },
];

/** Each user picks when the rival report arrives, and whether instant alerts are on. */
export function ReportScheduleCard({ initial }: { initial: ReportPrefs }) {
  const [prefs, setPrefs] = useState<ReportPrefs>(initial);
  const [saved, setSaved] = useState<ReportPrefs>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = JSON.stringify(prefs) !== JSON.stringify(saved);

  const update = (patch: Partial<ReportPrefs>) => {
    setPrefs((p) => ({ ...p, ...patch }));
    setState("idle");
  };

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/today/report-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const json = (await res.json()) as { success: boolean; prefs?: ReportPrefs };
      if (!res.ok || !json.success || !json.prefs) throw new Error();
      setPrefs(json.prefs);
      setSaved(json.prefs);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="zd-card zd-col" style={{ gap: 14, maxWidth: 680 }} aria-labelledby="report-schedule-title">
      <div className="zd-col" style={{ gap: 4 }}>
        <h2 id="report-schedule-title" className="zd-h3" style={{ margin: 0 }}>When should the report arrive?</h2>
        <p className="zd-muted" style={{ margin: 0 }}>Now: <strong>{describePrefs(saved)}</strong></p>
      </div>

      <div className="zd-row" role="radiogroup" aria-label="How often" style={{ gap: 8, flexWrap: "wrap" }}>
        {FREQUENCIES.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={prefs.frequency === f.value}
            className={`zd-btn${prefs.frequency === f.value ? " zd-btn-primary" : ""}`}
            onClick={() => update({ frequency: f.value })}
          >
            {f.label}
          </button>
        ))}
      </div>

      {prefs.frequency !== "off" && (
        <div className="zd-row" style={{ gap: 12, flexWrap: "wrap" }}>
          {prefs.frequency === "weekly" && (
            <label className="zd-col" style={{ gap: 4 }}>
              <span className="zd-muted">Day</span>
              <select className="zd-select" value={prefs.weekday} onChange={(e) => update({ weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i + 1}>{d}</option>
                ))}
              </select>
            </label>
          )}
          <label className="zd-col" style={{ gap: 4 }}>
            <span className="zd-muted">Time (IST)</span>
            <select className="zd-select" value={prefs.hour} onChange={(e) => update({ hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <label className="zd-row" style={{ gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={prefs.alerts} onChange={(e) => update({ alerts: e.target.checked })} />
        <span>Also email me right away when a rival makes a big move or changes an offer or price</span>
      </label>

      <div className="zd-row" style={{ gap: 12, alignItems: "center" }}>
        <button type="button" className="zd-btn zd-btn-primary" disabled={!dirty || state === "saving"} onClick={() => void save()}>
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        <span role="status" className={state === "error" ? "zd-error" : "zd-muted"}>
          {state === "saved" ? "Saved." : state === "error" ? "Could not save. Try again." : ""}
        </span>
      </div>
    </section>
  );
}
