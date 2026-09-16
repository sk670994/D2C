"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ZwirkCinematicScene from "@/components/zwirk/ZwirkCinematicScene";
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Signal = {
  id: string;
  label: string;
  eyebrow: string;
  value: string;
  detail: string;
  x: number;
  y: number;
};

const SIGNALS: Signal[] = [
  { id: "meta", label: "Meta Ads", eyebrow: "PAID SOCIAL", value: "12.4k ads", detail: "Creative pulse · ROAS · fatigue", x: 43, y: 23 },
  { id: "google", label: "Google Ads", eyebrow: "SEARCH", value: "8.1k ads", detail: "Intent · CAC · demand", x: 31, y: 43 },
  { id: "competitor", label: "Competitors", eyebrow: "MARKET", value: "320+ brands", detail: "Moves · offers · launches", x: 34, y: 65 },
  { id: "economics", label: "Unit Economics", eyebrow: "MARGIN", value: "Margin 32%", detail: "LTV · CAC · contribution", x: 69, y: 24 },
  { id: "adspy", label: "AdSpy", eyebrow: "CREATIVE INTELLIGENCE", value: "1.8k creatives", detail: "Trends · winners · repeats", x: 72, y: 47 },
  { id: "market", label: "Market Signals", eyebrow: "EXTERNAL", value: "7 trends", detail: "Demand · velocity · shifts", x: 70, y: 69 },
];

const STARTERS = [
  "Why is my CAC rising?",
  "Analyze this ad creative",
  "Compare with competitors",
  "Give me a 30-day plan",
];

function getReply(payload: any): string {
  const values = [
    payload?.reply,
    payload?.answer,
    payload?.message,
    payload?.content,
    payload?.text,
    payload?.result?.reply,
    payload?.result?.answer,
    payload?.data?.reply,
    payload?.data?.answer,
  ];

  const found = values.find(
    (value) => typeof value === "string" && value.trim(),
  );

  if (found) return String(found).trim();

  if (Array.isArray(payload?.choices) && payload.choices[0]?.message?.content) {
    return String(payload.choices[0].message.content).trim();
  }

  return "ZWIRK returned a result, but no readable answer was found.";
}

export default function ZwirkPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [activeSignal, setActiveSignal] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "observing" | "thinking" | "resolved">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const active = useMemo(
    () => SIGNALS.find((signal) => signal.id === activeSignal) ?? null,
    [activeSignal],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || mode === "thinking") return;

    setError(null);
    setMode("thinking");

    const userMessage: ChatMessage = { role: "user", content: text };
    const nextMessages: ChatMessage[] = [...messages, userMessage].slice(-12);
    setMessages(nextMessages);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/zwirk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: nextMessages,
          pagePath: "/zwirk",
          entityContext: active
            ? {
                type: "signal",
                id: active.id,
                name: active.label,
                payload: {
                  eyebrow: active.eyebrow,
                  value: active.value,
                  detail: active.detail,
                },
              }
            : undefined,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error ||
            payload?.message ||
            `ZWIRK request failed with HTTP ${response.status}`,
        );
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: getReply(payload),
      };

      setMessages((current): ChatMessage[] =>
        [...current, assistantMessage].slice(-12),
      );
      setMode("resolved");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMode("idle");
    } finally {
      abortRef.current = null;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input;
    setInput("");
    void ask(text);
  }

  return (
    <main className="zwirk-v3-page">
      <ZwirkCinematicScene
        mode={mode}
        activeSignal={activeSignal}
        signals={SIGNALS}
        onSignalSelect={(id) => {
          setActiveSignal(id);
          setMode("observing");
        }}
      />

      <div className="zwirk-v3-overlay">
        <header className="zwirk-v3-nav">
          <Link href="/dashboard" className="zwirk-v3-logo">ZOOPTRACK</Link>

          <nav>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/adspy">AdSpy</Link>
            <Link href="/brand-vault">Brand Vault</Link>
            <Link href="/competitors">Competitors</Link>
            <Link href="/zwirk" className="active">ZWIRK</Link>
            <Link href="/reports">Reports</Link>
          </nav>

          <div className="zwirk-v3-nav-right">
            <button className="zwirk-v3-search" type="button" onClick={() => document.getElementById("zwirk-v3-input")?.focus()}>
              <span>⌕</span>
              Ask ZWIRK anything...
              <kbd>Ctrl K</kbd>
            </button>
            <div className="zwirk-v3-avatar">S</div>
          </div>
        </header>

        <section className="zwirk-v3-hero">
          <div className="zwirk-v3-kicker">D2C &nbsp; // &nbsp; INTELLIGENCE &nbsp; // &nbsp; ACTION</div>
          <h1>From signals<br />to <span>decisions.</span></h1>
          <p>
            ZWIRK analyzes your market, competitors<br />
            and performance data to give you clear,<br />
            actionable growth decisions.
          </p>

          <button
            type="button"
            className="zwirk-v3-cta"
            onClick={() => document.getElementById("zwirk-v3-input")?.focus()}
          >
            Start an investigation <b>→</b>
          </button>

          <div className="zwirk-v3-watch">
            <span>▷</span> Watch how it works
          </div>
        </section>

        <div className="zwirk-v3-left-stats">
          <div><strong>12.4K</strong><span>Ads Analyzed</span></div>
          <div><strong>320+</strong><span>Brands Tracked</span></div>
          <div><strong>6</strong><span>Signal Sources</span></div>
          <div><strong>4.2x</strong><span>Faster Insights</span></div>
        </div>

        <div className="zwirk-v3-right-copy">
          <span>REAL DATA</span>
          <span>REAL CONTEXT</span>
          <span>REAL REASONING</span>
          <span>BIGGER DECISIONS</span>
        </div>

        <div className="zwirk-v3-bottom-left">
          <span>BUILT FOR</span>
          <strong>D2C OPERATORS</strong>
        </div>

        <div className="zwirk-v3-bottom-right">
          <span>TURN</span>
          <span>INSIGHTS</span>
          <span>INTO</span>
          <span>GROWTH</span>
        </div>

        <section className="zwirk-v3-command">
          <div className="zwirk-v3-tabs">
            {["Ask", "Analyze", "Compare", "Plan", "Research"].map((tab, index) => (
              <button key={tab} type="button" className={index === 0 ? "active" : ""}>
                {tab}
              </button>
            ))}
          </div>

          <div className="zwirk-v3-input-shell">
            <span className="zwirk-v3-spark">✦</span>
            <form onSubmit={submit}>
              <input
                id="zwirk-v3-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={mode === "thinking"}
                placeholder="Ask ZWIRK anything about your business..."
              />
            </form>

            <button
              type="button"
              className="zwirk-v3-send"
              disabled={!input.trim() || mode === "thinking"}
              onClick={() => void ask(input)}
            >
              →
            </button>
          </div>

          <div className="zwirk-v3-starters">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                disabled={mode === "thinking"}
                onClick={() => void ask(starter)}
              >
                {starter}
              </button>
            ))}
          </div>

          {messages.length > 0 && (
            <div className="zwirk-v3-answer">
              <div className="answer-state">
                <span className={mode === "thinking" ? "pulse thinking" : "pulse"} />
                {mode === "thinking" ? "REASONING…" : active ? `ANALYSIS · ${active.label.toUpperCase()}` : "ZWIRK"}
              </div>
              <div className="answer-copy">
                {messages[messages.length - 1]?.role === "assistant"
                  ? messages[messages.length - 1].content
                  : "Processing signals…"}
              </div>
            </div>
          )}

          {error && <div className="zwirk-v3-error">{error}</div>}
        </section>
      </div>
    </main>
  );
}




