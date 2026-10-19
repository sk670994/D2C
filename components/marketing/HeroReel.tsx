"use client";

import { useEffect, useRef, useState } from "react";
import s from "./HeroReel.module.css";

// Homepage hero: a looping walk through five product screens. All brands are made up (sample data).
const SCENES = [
  { id: "finder", label: "Ad finder", url: "zooptrack.com/ads", ms: 4200 },
  { id: "vault", label: "Brand Vault", url: "zooptrack.com/vault/glowlab", ms: 7600 },
  { id: "moves", label: "Rival moves", url: "zooptrack.com/today", ms: 3600 },
  { id: "decode", label: "AI decoding", url: "zooptrack.com/ads/decode", ms: 3600 },
  { id: "moh", label: "Match or hold", url: "zooptrack.com/match-or-hold", ms: 7000 },
] as const;
const HOLD = 600;
const TICK = 50;
const END = 1e9; // "show the final frame"

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(" ");
const show = (on: boolean, hid = s.hidden) => cx(s.a, !on && hid);

export function HeroReel() {
  const [idx, setIdx] = useState(0);
  const [t, setT] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  const ref = useRef<HTMLDivElement | null>(null);
  const tRef = useRef(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !visible) return;
    let local = tRef.current;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      local += TICK;
      if (local >= SCENES[idx].ms + HOLD) {
        tRef.current = 0;
        setT(0);
        setIdx((idx + 1) % SCENES.length);
        return;
      }
      tRef.current = local;
      setT(local);
    }, TICK);
    return () => window.clearInterval(id);
  }, [idx, run, reduced, visible]);

  const scene = SCENES[idx];
  const time = reduced ? END : t;

  return (
    <div className={s.reel} ref={ref}>
      <div className={s.tabs} role="tablist" aria-label="Product tour">
        {SCENES.map((sc, i) => (
          <button
            key={sc.id}
            type="button"
            role="tab"
            className={s.tab}
            aria-selected={i === idx}
            onClick={() => { tRef.current = 0; setT(0); setIdx(i); setRun((r: number) => r + 1); }}
          >
            {sc.label}
            {i === idx && !reduced ? <span className={s.fill} style={{ width: `${Math.min(100, (t / (sc.ms + HOLD)) * 100)}%` }} /> : null}
          </button>
        ))}
      </div>
      <div className={s.stage} role="tabpanel" aria-label={scene.label}>
        <div className={s.bar}><i /><i /><i /><b>{scene.url}</b></div>
        <div className={s.body} key={scene.id}>
          {scene.id === "finder" && <Finder t={time} />}
          {scene.id === "vault" && <Vault t={time} />}
          {scene.id === "moves" && <Moves t={time} />}
          {scene.id === "decode" && <Decode t={time} reduced={reduced} />}
          {scene.id === "moh" && <MatchOrHold t={time} />}
        </div>
      </div>
      <p className={s.note}>Sample data · made-up brands. Your account shows your real rivals.</p>
    </div>
  );
}

const THUMBS = [
  { bg: "linear-gradient(150deg,#f3d9c4,#d99a74)", days: "74 days", win: true },
  { bg: "linear-gradient(150deg,#d7e7d2,#8fbf8a)", days: "12 days" },
  { bg: "linear-gradient(150deg,#dce7f6,#93b4e0)", days: "61 days", win: true },
  { bg: "linear-gradient(150deg,#f6e3b4,#e2b85a)", days: "New" },
  { bg: "linear-gradient(150deg,#ead9f2,#b394cf)", days: "9 days" },
  { bg: "linear-gradient(150deg,#f5d3d0,#d98a84)", days: "5 days" },
];

function Finder({ t }: { t: number }) {
  const word = "Rootsy";
  const typed = word.slice(0, Math.min(word.length, Math.floor(t / 120)));
  const dd = t >= 970 && t < 1670;
  return (
    <>
      <div className={s.search}>
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        <span>{typed}</span>
        {t < 1670 ? <span className={s.caret} /> : null}
      </div>
      {dd ? (
        <div className={s.dd}>
          <div className={s.ddHl}><span><b>Rootsy</b> · Facebook page</span><span className={s.muted}>64 live ads</span></div>
          <div><span>Rootsy Naturals</span><span className={s.muted}>3 live ads</span></div>
        </div>
      ) : (
        <div className={s.grid6}>
          {THUMBS.map((th, i) => (
            <div key={i} className={cx(s.thumb, th.win && s.thumbWin, s.a, t < 1700 + i * 110 && s.hiddenS)} style={{ background: th.bg }}>
              <span className={s.pill}>{th.win ? `Running ${th.days}` : th.days}</span>
            </div>
          ))}
        </div>
      )}
      <div className={cx(s.cov, show(t >= 2600))}>
        <span>Meta lists <b className={s.mono}>64</b> · Zooptrack has <b className={s.mono}>64</b></span>
        <span className={cx(s.pill, s.pGreen)}>Complete</span>
      </div>
    </>
  );
}

const VAULT = [
  { key: "h", side: "Hooks", title: "Which openings Glowlab repeats", color: "var(--blue)", rows: [["Doctor says", 38], ["Before / after", 27], ["Founder story", 18]] },
  { key: "c", side: "Creators", title: "Who appears in their ads", color: "var(--plum)", rows: [["Dermatologist", 41], ["Customer UGC", 33], ["Founder", 14]] },
  { key: "l", side: "Languages", title: "Which languages they speak in", color: "var(--green)", rows: [["Hinglish", 52], ["Hindi", 28], ["English", 20]] },
] as const;

function Vault({ t }: { t: number }) {
  const phase = Math.min(VAULT.length - 1, Math.floor(t / 2400));
  const local = t - phase * 2400;
  const v = VAULT[phase];
  return (
    <div className={s.vault}>
      <div className={s.vside}>
        {VAULT.map((x, i) => <span key={x.key} className={i === phase ? s.on : undefined}>{x.side}</span>)}
        <span>Offers</span>
        <span>Formats</span>
      </div>
      <div className={s.vmain} key={v.key}>
        <div className={s.vt}>{v.title}</div>
        <span className={s.muted}>From 212 ads, last 90 days</span>
        {v.rows.map(([name, pct], i) => (
          <div key={name} className={cx(s.row, show(local >= 150 + i * 180))}>
            <div className={s.top}><span>{name}</span><b className={s.mono}>{pct}%</b></div>
            <div className={s.track}><i style={{ width: local >= 300 + i * 180 ? `${pct}%` : "0%", background: v.color }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

const MOVES = [
  { pill: s.pBlue, tag: "Launch", text: "12 new ads in 3 days", when: "Mon" },
  { pill: s.pAmber, tag: "Offer", text: "Switched to Buy 2 Get 1", when: "Tue" },
  { pill: s.pGreen, tag: "Winner", text: "One ad still running at 74 days", when: "Wed" },
  { pill: s.pRed, tag: "Stopped", text: "Paused 9 sale ads", when: "Thu" },
];

function Moves({ t }: { t: number }) {
  return (
    <>
      <div className={s.headline}>What Glowlab changed this week</div>
      <div className={s.moves}>
        {MOVES.map((m, i) => (
          <div key={m.tag} className={cx(s.mv, show(t >= 200 + i * 650, s.hiddenX))}>
            <span className={cx(s.pill, m.pill)}>{m.tag}</span>
            <span className={s.mvT}>{m.text}</span>
            <span className={s.muted}>{m.when}</span>
          </div>
        ))}
      </div>
    </>
  );
}

const LABELS = [
  ["Hook type", "Doctor says"],
  ["Angle", "Dermat-approved"],
  ["Language", "Hinglish"],
  ["Emotion", "Reassurance"],
  ["Offer", "Buy 2 Get 1"],
];

function Decode({ t, reduced }: { t: number; reduced: boolean }) {
  return (
    <div className={s.decode}>
      <div className={s.adcard}>
        {!reduced ? <div className={s.scan} /> : null}
        <div className={s.cap}>&ldquo;Dermat batati hain: 3 din mein farak dikhega&rdquo;</div>
      </div>
      <div className={s.labels}>
        {LABELS.map(([k, v], i) => (
          <div key={k} className={cx(s.lab, show(t >= 1300 + i * 330, s.hiddenX))}>
            <small>{k}</small><b>{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

const BREAK_EVEN = 412;
const CASES = [
  { brand: "Dermique", offer: "Flat 30% off", unit: 349, verdict: "HOLD", tone: "red", why: "Matching puts you below break-even on every order." },
  { brand: "Rootsy", offer: "Buy 2 Get 1", unit: 431, verdict: "MATCH", tone: "green", why: "You can match and still keep ₹19 an order." },
] as const;

function MatchOrHold({ t }: { t: number }) {
  const ci = t >= 3500 ? 1 : 0;
  const c = CASES[ci];
  const local = t - ci * 3500;
  const moved = local >= 600;
  const pos = 50 + (c.unit - BREAK_EVEN) * 0.55;
  const soft = c.tone === "red" ? "var(--red-soft)" : "var(--green-soft)";
  const ink = c.tone === "red" ? "var(--red)" : "var(--green)";
  return (
    <div className={s.moh} key={c.brand}>
      <div className={cx(s.offer, show(local >= 100))}>
        <span className={s.muted}>{c.brand} is running</span>
        <span className={s.big}>{c.offer}</span>
        <span className={s.muted}>Works out to <b className={s.mono}>₹{c.unit}</b> per unit for them</span>
      </div>
      <div className={s.meter} aria-hidden>
        <div className={s.line} />
        <div className={s.be}><span>Your break-even ₹{BREAK_EVEN}</span></div>
        <div className={s.mark} style={{ left: `${moved ? pos : 50}%`, background: moved ? ink : "var(--muted)" }} />
      </div>
      <div className={cx(s.verdict, show(local >= 1400))} style={{ background: soft, color: ink }}>
        <span>{c.why}</span>
        <span className={s.stamp}>{c.verdict}</span>
      </div>
    </div>
  );
}
