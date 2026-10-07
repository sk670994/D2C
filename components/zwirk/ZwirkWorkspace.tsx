"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

/** Each mode is a working shortcut: it drafts a prompt the user can edit before sending. */
const MODES: Array<{ key: string; label: string; draft: string }> = [
  { key: "ask", label: "Ask", draft: "" },
  { key: "compare", label: "Compare rivals", draft: "Compare my rivals' ads this week: formats, offers, languages and what changed. Who is pushing hardest?" },
  { key: "counter", label: "Counter-offer", draft: "My biggest rival just changed an offer. Suggest 3 counter-offers I can afford, with the hook and format for each." },
  { key: "plan", label: "30-day plan", draft: "Give me a 30-day ad testing plan based on what my rivals are running and what has kept running longest." },
  { key: "creative", label: "Creative brief", draft: "Write a creative brief for my next ad: hook, offer, format, language and a 20-second script outline." },
];

const STARTERS = [
  "Which of my rivals' ads has run the longest, and why might it work?",
  "What offers are my rivals running right now?",
  "Which rival launched the most new ads this week?",
  "Which languages and formats are my rivals betting on?",
];

function readReply(payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const candidates = [p.reply, p.answer, p.message, p.content];
  const found = candidates.find((v): v is string => typeof v === "string" && v.trim().length > 0);
  return found?.trim() ?? "ZWIRK answered, but the reply was empty. Try asking again.";
}

/** ZWIRK as a calm research desk: a conversation, working shortcuts, no decoration. */
export function ZwirkWorkspace() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    const next: ChatMessage[] = [...messages, { role: "user" as const, content: text }].slice(-12);
    setMessages(next);
    setInput("");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/zwirk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ messages: next, pagePath: "/zwirk" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const p = (payload ?? {}) as Record<string, unknown>;
        throw new Error(typeof p.error === "string" ? p.error : `ZWIRK could not answer (error ${response.status}).`);
      }
      setMessages((current) => [...current, { role: "assistant" as const, content: readReply(payload) }].slice(-12));
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "ZWIRK could not answer. Try again.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  function pickMode(key: string) {
    setMode(key);
    const draft = MODES.find((m) => m.key === key)?.draft ?? "";
    setInput(draft);
    inputRef.current?.focus();
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? null;

  return (
    <div className="zw">
      <header className="zw-head">
        <h1 className="zd-h1">Ask ZWIRK</h1>
        <p className="zd-lede">Answers come from your rivals' ads, your Brand Vault and your own numbers in Zooptrack. Ask in plain words.</p>
      </header>

      <div className="zw-modes" role="radiogroup" aria-label="What kind of answer">
        {MODES.map((m) => (
          <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className={`zw-mode${mode === m.key ? " is-on" : ""}`} onClick={() => pickMode(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      <form className="zw-ask" onSubmit={submit}>
        <label htmlFor="zw-input" className="zd-sr">
          Your question
        </label>
        <textarea
          id="zw-input"
          ref={inputRef}
          value={input}
          rows={3}
          disabled={busy}
          placeholder="For example: what changed in my rivals' offers this week?"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
        />
        <div className="zw-ask-foot">
          <span className="zd-muted">Enter to send, Shift + Enter for a new line</span>
          <button type="submit" className="zd-btn zd-btn-primary" disabled={busy || !input.trim()}>
            {busy ? "Thinking…" : "Ask"}
          </button>
        </div>
      </form>

      {messages.length === 0 ? (
        <section className="zd-section" aria-labelledby="zw-starters">
          <h2 id="zw-starters" className="zd-h3">
            Good first questions
          </h2>
          <div className="zw-starters">
            {STARTERS.map((s) => (
              <button key={s} type="button" className="zw-starter" disabled={busy} onClick={() => void ask(s)}>
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="zw-thread" aria-live="polite" aria-label="Conversation">
          {messages.map((m, i) => (
            <article key={i} className={`zw-msg zw-msg-${m.role}`}>
              <span className="zw-who">{m.role === "user" ? "You" : "ZWIRK"}</span>
              <div className="zw-text">{m.content}</div>
            </article>
          ))}
          {busy ? (
            <article className="zw-msg zw-msg-assistant" aria-busy="true">
              <span className="zw-who">ZWIRK</span>
              <div className="zw-text zd-muted">Reading your rivals' data…</div>
            </article>
          ) : null}
          <div ref={endRef} />
        </section>
      )}

      {error ? (
        <div className="zd-error zw-error" role="alert">
          <span>{error}</span>
          {lastUser ? (
            <button
              type="button"
              className="zd-btn"
              onClick={() => {
                setMessages((cur) => (cur[cur.length - 1]?.role === "user" ? cur.slice(0, -1) : cur));
                void ask(lastUser);
              }}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {messages.length > 0 ? (
        <button
          type="button"
          className="zd-btn zd-btn-text"
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            abortRef.current?.abort();
            setMessages([]);
            setError(null);
            setBusy(false);
          }}
        >
          Start a new conversation
        </button>
      ) : null}
    </div>
  );
}
