"use client";

import { useState } from "react";

import { describePrefs, timeLabel, WEEKDAYS, type ReportFrequency, type ReportPrefs } from "@/lib/today/report-schedule";

/** Every 15 minutes of the day, as "h:m" values. */
const TIMES = Array.from({ length: 96 }, (_, i) => ({ hour: Math.floor(i / 4), minute: (i % 4) * 15 }));

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
  const [send, setSend] = useState<{ state: "idle" | "sending" | "sent" | "error"; message?: string }>({ state: "idle" });

  async function sendNow() {
    setSend({ state: "sending" });
    try {
      const res = await fetch("/api/today/report-send-now", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; to?: string; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "The email could not be sent.");
      setSend({ state: "sent", message: `Sent to ${json.to}. It should arrive within a minute.` });
    } catch (err) {
      setSend({ state: "error", message: err instanceof Error ? err.message : "The email could not be sent." });
    }
  }
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
            <select
              className="zd-select"
              value={`${prefs.hour}:${prefs.minute}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                update({ hour: h, minute: m });
              }}
            >
              {/* Keep a saved time that is not on the 15-minute grid selectable. */}
              {prefs.minute % 15 !== 0 ? <option value={`${prefs.hour}:${prefs.minute}`}>{timeLabel(prefs.hour, prefs.minute)}</option> : null}
              {TIMES.map((t) => (
                <option key={`${t.hour}:${t.minute}`} value={`${t.hour}:${t.minute}`}>
                  {timeLabel(t.hour, t.minute)}
                </option>
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

      <div className="zd-row zd-divider" style={{ gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="zd-btn" disabled={send.state === "sending"} onClick={() => void sendNow()}>
          {send.state === "sending" ? "Sending…" : "Send it now"}
        </button>
        <span role="status" className={send.state === "error" ? "zd-error" : "zd-muted"} style={{ flex: 1, minWidth: 200 }}>
          {send.message ?? "Emails you today's report right away. Your schedule stays as it is."}
        </span>
      </div>
    </section>
  );
}
