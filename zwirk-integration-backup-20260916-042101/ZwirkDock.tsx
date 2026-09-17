"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buildZwirkContext } from "@/lib/decision/brief";
import type { CalculatedReport } from "@/lib/types/domain";
import { Button } from "@/components/ui/button";

type ChatMessage = { role: "user" | "assistant"; content: string };

function pageContext(pathname: string): string {
  if (pathname.startsWith("/adspy")) return "AdSpy · competitor intelligence";
  if (pathname.startsWith("/brand-vault")) return "Brand Vault";
  if (pathname.startsWith("/zwirk")) return "ZWIRK workspace";
  return "Command Center · profitability";
}

export function ZwirkDock() {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [queued, setQueued] = useState<string | null>(null);

  const isApp = ["/dashboard", "/adspy", "/brand-vault", "/records", "/zwirk"].some((path) => pathname.startsWith(path));

  const context = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("report");
      if (!raw) return "";
      const report = JSON.parse(raw) as CalculatedReport;
      if (!report?.adMetrics) return "";
      return buildZwirkContext(report);
    } catch {
      return "";
    }
  }, [open, pathname]);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => setAuthed(Boolean(data.user)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session?.user));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function onAsk(event: Event) {
      const prompt = (event as CustomEvent<string>).detail;
      if (!prompt) return;
      setOpen(true);
      setQueued(prompt);
    }
    window.addEventListener("zooptrack:ask-zwirk", onAsk);
    return () => window.removeEventListener("zooptrack:ask-zwirk", onAsk);
  }, []);

  useEffect(() => {
    if (!queued) return;
    const prompt = queued;
    setQueued(null);
    void send(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued]);

  async function send(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zwirk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          context: context || undefined
        })
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "ZWIRK failed");
      setMessages([...next, { role: "assistant", content: data.reply || "No response generated." }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ZWIRK failed");
    } finally {
      setLoading(false);
    }
  }

  if (!authed || !isApp) return null;

  return (
    <>
      <button type="button" className="zwirk-dock-fab" onClick={() => setOpen(true)} aria-label="Open ZWIRK">
        ✦ ZWIRK
      </button>
      {open ? (
        <div className="zwirk-dock">
          <header>
            <div>
              <strong>✦ ZWIRK</strong>
              <span>Growth Intelligence Copilot</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </header>
          <p className="zwirk-dock-context">Context · {pageContext(pathname)}</p>
          <div className="zwirk-dock-thread">
            {messages.length === 0 ? (
              <p className="muted-text">Ask why profit moved, what to pause, or what to test next. I will not invent metrics.</p>
            ) : null}
            {messages.map((msg, index) => (
              <article key={`${msg.role}-${index}`} className={`zwirk-dock-msg ${msg.role}`}>
                {msg.content}
              </article>
            ))}
            {loading ? <p className="muted-text">Working…</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
          </div>
          <form
            className="zwirk-dock-form"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask ZWIRK…"
              aria-label="Ask ZWIRK"
            />
            <Button type="submit" disabled={loading}>↑</Button>
          </form>
          <button type="button" className="zwirk-dock-full" onClick={() => router.push("/zwirk")}>
            Open full workspace
          </button>
        </div>
      ) : null}
    </>
  );
}
