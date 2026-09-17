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
  { id: "meta", label: "META ADS", eyebrow: "PAID SOCIAL", value: "Creative pulse", detail: "Hooks, spend pressure, fatigue", x: 14, y: 24 },
  { id: "google", label: "GOOGLE ADS", eyebrow: "SEARCH", value: "Intent stream", detail: "Demand, CPC, conversion intent", x: 81, y: 24 },
  { id: "competitor", label: "COMPETITOR PULSE", eyebrow: "MARKET", value: "Live movement", detail: "New entrants, offer shifts", x: 87, y: 51 },
  { id: "economics", label: "UNIT ECONOMICS", eyebrow: "MARGIN", value: "Contribution", detail: "CAC, AOV, margin pressure", x: 75, y: 76 },
  { id: "adspy", label: "ADSPY", eyebrow: "CREATIVE INTELLIGENCE", value: "Pattern scan", detail: "Winners, repeats, longevity", x: 25, y: 76 },
  { id: "market", label: "MARKET SIGNALS", eyebrow: "EXTERNAL", value: "Demand field", detail: "Categories, messages, velocity", x: 10, y: 51 },
];

const STARTERS = [
  { label: "Quick profit check", prompt: "Give me a quick profit check for my D2C business." },
  { label: "Find growth blockers", prompt: "What are the biggest growth blockers visible in my current data?" },
  { label: "Analyze creative", prompt: "Analyze the strongest creative signals and explain what I should test next." },
  { label: "Can I scale?", prompt: "Can I scale spend right now? Show the evidence and the missing evidence." },
];

function getReply(payload: any): string {
  const candidates = [
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

  const hit = candidates.find((value) => typeof value === "string" && value.trim());
  if (hit) return hit.trim();

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

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || mode === "thinking") return;

    setError(null);
    setMode("thinking");

    const userMessage: ChatMessage = {
      role: "user",
      content: text,
    };

    const nextMessages: ChatMessage[] = [
      ...messages,
      userMessage,
    ].slice(-12);

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

      const reply = getReply(payload);

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: reply,
      };

      setMessages((current): ChatMessage[] => [
        ...current,
        assistantMessage,
      ].slice(-12));

      setMode("resolved");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;

      const message =
        err instanceof Error ? err.message : "Something went wrong.";

      setError(message);
      setMode("idle");
    } finally {
      abortRef.current = null;
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input;
    setInput("");
    void ask(question);
  }

  return (
    <main className="zwirk-page">
      <ZwirkCinematicScene
        mode={mode}
        activeSignal={activeSignal}
        signals={SIGNALS}
        onSignalSelect={(id) => {
          setActiveSignal(id);
          setMode("observing");
        }}
      />

      <div className="zwirk-ui">
        <header className="zwirk-topbar">
          <div className="zwirk-brand">
            <div className="zwirk-mark">Z</div>
            <div>
              <div className="zwirk-name">ZWIRK</div>
              <div className="zwirk-sub">GROWTH INTELLIGENCE ENGINE</div>
            </div>
          </div>

          <div className="zwirk-top-status">
            <span className="live-dot" />
            LIVE SIGNAL FIELD
            <span className="top-divider" />
            {mode === "thinking"
              ? "REASONING"
              : mode === "resolved"
                ? "SIGNAL CONVERGED"
                : mode === "observing"
                  ? "OBSERVING"
                  : "STANDING BY"}
          </div>

          <Link href="/dashboard" className="zwirk-back">
            Dashboard
          </Link>
        </header>

        <section className="zwirk-hero-copy">
          <div className="hero-kicker">A LIVING DECISION ENGINE FOR D2C</div>
          <h1>Consume signals.<br />Reduce uncertainty.</h1>
          <p>
            ZWIRK watches the operating picture, connects evidence and collapses
            the noise into the next decision.
          </p>
        </section>

        <div className="zwirk-signal-label">
          {active ? `${active.label} · ${active.value}` : "ALL SIGNALS"}
        </div>

        <div className="zwirk-starters">
          {STARTERS.map((starter) => (
            <button
              key={starter.label}
              type="button"
              className="starter-chip"
              disabled={mode === "thinking"}
              onClick={() => void ask(starter.prompt)}
            >
              {starter.label}
              <span>↗</span>
            </button>
          ))}
        </div>

        <aside className="zwirk-console">
          <div className="console-head">
            <div>
              <div className="console-eyebrow">COMMAND CONSOLE</div>
              <div className="console-title">
                {active ? `Inspecting ${active.label}` : "Ask ZWIRK anything"}
              </div>
            </div>
            <div className={`console-status ${mode}`}>
              <span />
              {mode === "thinking"
                ? "PROCESSING"
                : mode === "resolved"
                  ? "READY"
                  : "LIVE"}
            </div>
          </div>

          <div className="console-body">
            <div className="console-thread">
              {messages.length === 0 ? (
                <div className="console-empty">
                  <span className="console-pulse" />
                  Pick a signal above or ask a question below.
                </div>
              ) : (
                messages.slice(-4).map((message, index) => (
                  <div
                    key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
                    className={`console-message ${message.role}`}
                  >
                    <span className="message-role">
                      {message.role === "user" ? "YOU" : "ZWIRK"}
                    </span>
                    <p>{message.content}</p>
                  </div>
                ))
              )}

              {mode === "thinking" && (
                <div className="console-message assistant thinking-message">
                  <span className="message-role">ZWIRK</span>
                  <div className="thinking-row">
                    <span />
                    <span />
                    <span />
                    <em>connecting evidence</em>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={onSubmit} className="zwirk-input-row">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about profit, creative, competitors, scale, CAC or anything in your workspace…"
                disabled={mode === "thinking"}
              />
              <button type="submit" disabled={!input.trim() || mode === "thinking"}>
                Ask ZWIRK
                <span>↗</span>
              </button>
            </form>

            {error && <div className="zwirk-error">{error}</div>}
          </div>
        </aside>

        <div className="zwirk-footer-note">
          <span>ZWIRK</span>
          <span>FACT → SIGNAL → REASONING → DECISION</span>
        </div>
      </div>
    </main>
  );
}

