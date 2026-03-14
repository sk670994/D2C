"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const starterPrompts = [
  "Diagnose my unit economics with a 2.6 ROAS and 28% margin.",
  "What should I fix first if CAC is rising 20% MoM?",
  "Give me a 30-day scale plan for Meta and Google.",
  "Summarize the top 3 profit levers for DTC brands."
];

type ZwirkContext = {
  label: string;
  summary: string;
};

export default function ZwirkPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "I’m ZWIRK. Tell me your current ROAS, CAC, margin, and order volume, and I’ll map the fastest path to profit."
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ZwirkContext | null>(null);
  const [useContext, setUseContext] = useState(true);
  const [actionToasts, setActionToasts] = useState<Record<string, string>>({});

  const canSend = input.trim().length > 0 && !loading;

  const chatBody = useMemo(() => messages.filter((msg) => msg.content.trim().length > 0), [messages]);

  useEffect(() => {
    const saved = localStorage.getItem("zwirkChat");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      } catch {
        // no-op
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("zwirkChat", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    const stored = sessionStorage.getItem("report");
    if (!stored) return;
    try {
      const report = JSON.parse(stored) as {
        unitEconomics?: { contributionMarginPct?: number; maxAllowableCac?: number };
        adMetrics?: { blendedRoas?: number; blendedCac?: number; totalAdSpend?: number };
        monthlyPnl?: { netProfitMarginPct?: number; netRevenueMonth?: number; netProfitMonth?: number };
        scalePlanner?: { readiness?: string };
      };
      const summary = [
        `Contribution margin: ${pct(report.unitEconomics?.contributionMarginPct)}`,
        `Blended ROAS: ${fmt(report.adMetrics?.blendedRoas)}x`,
        `Blended CAC: ${fmt(report.adMetrics?.blendedCac)}`,
        `Max allowable CAC: ${fmt(report.unitEconomics?.maxAllowableCac)}`,
        `Net profit margin: ${pct(report.monthlyPnl?.netProfitMarginPct)}`,
        `Net revenue (month): ${fmt(report.monthlyPnl?.netRevenueMonth)}`,
        `Net profit (month): ${fmt(report.monthlyPnl?.netProfitMonth)}`,
        `Scale verdict: ${report.scalePlanner?.readiness ?? "Unknown"}`
      ].join("\n");
      setContext({ label: "Dashboard context loaded", summary });
    } catch {
      // no-op
    }
  }, []);

  function fmt(value?: number, suffix = "") {
    if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
    return `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;
  }

  function pct(value?: number) {
    if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
    return `${(value * 100).toFixed(1)}%`;
  }

  function resetChat() {
    const initial: ChatMessage[] = [
      {
        role: "assistant",
        content: "I’m ZWIRK. Tell me your current ROAS, CAC, margin, and order volume, and I’ll map the fastest path to profit."
      }
    ];
    setMessages(initial);
    setError(null);
    localStorage.removeItem("zwirkChat");
  }

  async function copyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no-op
    }
  }

  function showActionToast(key: string, label: string) {
    setActionToasts((prev) => ({ ...prev, [key]: label }));
    window.setTimeout(() => {
      setActionToasts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 1400);
  }

  function downloadMessage(text: string) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zwirk-response-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function retryLastPrompt() {
    const lastUser = [...messages].reverse().find((msg) => msg.role === "user");
    if (!lastUser) return;
    void sendMessage(lastUser.content);
  }

  function tooltipFor(index: number, action: string, label: string) {
    return actionToasts[`${index}:${action}`] ?? label;
  }

  async function sendMessage(message: string) {
    setLoading(true);
    setError(null);
    const nextMessages = [...messages, { role: "user", content: message }];
    setMessages(nextMessages);
    setInput("");

    try {
      const res = await fetch("/api/zwirk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          context: useContext ? context?.summary : undefined
        })
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || "Unable to reach ZWIRK");
      }

      const data = (await res.json()) as { reply?: string };
      const reply = data.reply || "I could not generate a response.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ZWIRK is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="main zwirk-page">
      <header className="zwirk-hero">
        <div>
          <p className="eyebrow">Zooptrack AI Assistant</p>
          <h1><span>ZWIRK</span> — your on-demand growth operator</h1>
          <p className="muted-text">
            Ask profit questions, scenario ideas, and growth diagnostics. ZWIRK responds with actionable next steps.
          </p>
          <div className="zwirk-hero-actions">
            <Link href="/dashboard">
              <Button type="button" variant="secondary">Back to Dashboard</Button>
            </Link>
            <Link href="/">
              <Button type="button" variant="secondary">Home</Button>
            </Link>
            <Button type="button" variant="secondary" onClick={resetChat}>
              Clear Chat
            </Button>
          </div>
          {context ? (
            <label className="zwirk-context-toggle">
              <input type="checkbox" checked={useContext} onChange={(e) => setUseContext(e.target.checked)} />
              <span>{context.label}</span>
            </label>
          ) : (
            <p className="muted-text zwirk-context-note">Connect your dashboard to unlock context-aware answers.</p>
          )}
        </div>
        <Card className="zwirk-hero-card">
          <CardHeader>
            <CardTitle>Starter prompts</CardTitle>
            <CardDescription>Pick one to launch a fast diagnostic.</CardDescription>
          </CardHeader>
          <CardContent className="zwirk-prompt-grid">
            {starterPrompts.map((prompt) => (
              <button key={prompt} type="button" className="zwirk-prompt" onClick={() => sendMessage(prompt)}>
                {prompt}
              </button>
            ))}
          </CardContent>
        </Card>
        <Card className="zwirk-hero-card zwirk-capabilities">
          <CardHeader>
            <CardTitle>What ZWIRK does best</CardTitle>
            <CardDescription>Fast, tactical answers in plain English.</CardDescription>
          </CardHeader>
          <CardContent className="zwirk-capability-list">
            <div>
              <h4>Profit diagnostics</h4>
              <p className="muted-text">Identify margin, CAC, and ROAS bottlenecks in seconds.</p>
            </div>
            <div>
              <h4>Scale guidance</h4>
              <p className="muted-text">Turn numbers into “scale / hold / fix” calls.</p>
            </div>
            <div>
              <h4>Scenario planning</h4>
              <p className="muted-text">Compare changes in AOV, returns, or CAC quickly.</p>
            </div>
          </CardContent>
        </Card>
      </header>

      <section className="zwirk-chat surface">
        <div className="zwirk-chat-header">
          <h2>Conversation</h2>
          <span className={`status-dot ${loading ? "status-warn" : "status-good"}`}>
            {loading ? "ZWIRK is thinking..." : "Ready"}
          </span>
        </div>
        <div className="zwirk-messages">
          {chatBody.map((msg, index) => (
            <div key={`${msg.role}-${index}`} className={`zwirk-message-group ${msg.role}`}>
              <div className={`zwirk-message ${msg.role}`}>
                <span>{msg.content}</span>
              </div>
              {msg.role === "assistant" ? (
                <div className="zwirk-actions">
                  <button
                    type="button"
                    className="zwirk-action"
                    onClick={() => {
                      void copyMessage(msg.content);
                      showActionToast(`${index}:copy`, "Copied");
                    }}
                    data-tooltip={tooltipFor(index, "copy", "Copy")}
                    aria-label="Copy response"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
                      <rect x="9" y="9" width="10" height="10" rx="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="zwirk-action"
                    onClick={() => showActionToast(`${index}:like`, "Liked")}
                    data-tooltip={tooltipFor(index, "like", "Like")}
                    aria-label="Like response"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
                      <path d="M7 11V5a2 2 0 0 1 2-2h0l3 6h5a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-5l-3 6h0a2 2 0 0 1-2-2v-6z" />
                      <path d="M5 11h2v9H5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="zwirk-action"
                    onClick={() => showActionToast(`${index}:dislike`, "Disliked")}
                    data-tooltip={tooltipFor(index, "dislike", "Dislike")}
                    aria-label="Dislike response"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
                      <path d="M7 13v6a2 2 0 0 0 2 2h0l3-6h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5L9 3h0a2 2 0 0 0-2 2v6z" />
                      <path d="M5 4h2v9H5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="zwirk-action"
                    onClick={() => {
                      downloadMessage(msg.content);
                      showActionToast(`${index}:download`, "Downloaded");
                    }}
                    data-tooltip={tooltipFor(index, "download", "Download")}
                    aria-label="Download response"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
                      <path d="M12 3v10" />
                      <path d="M8 9l4 4 4-4" />
                      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="zwirk-action"
                    onClick={() => {
                      retryLastPrompt();
                      showActionToast(`${index}:retry`, "Retrying");
                    }}
                    data-tooltip={tooltipFor(index, "retry", "Retry")}
                    aria-label="Retry response"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
                      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                      <path d="M20 4v6h-6" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {loading ? (
            <div className="zwirk-message assistant zwirk-typing">
              <span className="zwirk-dot" />
              <span className="zwirk-dot" />
              <span className="zwirk-dot" />
            </div>
          ) : null}
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="zwirk-input">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question for ZWIRK..."
            rows={3}
          />
          <Button type="button" onClick={() => sendMessage(input)} disabled={!canSend}>
            {loading ? "Sending..." : "Send to ZWIRK"}
          </Button>
        </div>
      </section>
    </main>
  );
}
