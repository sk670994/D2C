"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CalculatedReport } from "@/lib/types/domain";
import type { ChatMessage } from "./ZwirkDockPanel";

// The panel UI (and the report-context builder) load on first open, so the
// floating button costs almost nothing on every app page.
const ZwirkDockPanel = dynamic(
  () => import("./ZwirkDockPanel").then((m) => m.ZwirkDockPanel),
  { ssr: false },
);

function pageContext(pathname: string): string {
  if (pathname.startsWith("/zooplens")) return "ZoopLens · competitor intelligence";
  if (pathname.startsWith("/brand-vault")) return "Brand Vault";
  if (pathname.startsWith("/zwirk")) return "ZWIRK workspace";
  return "Command Center · profitability";
}

async function getStoredZwirkContext(): Promise<string> {
  try {
    const raw = sessionStorage.getItem("report");

    if (!raw) {
      return "";
    }

    const report = JSON.parse(raw) as CalculatedReport;

    if (!report?.adMetrics) {
      return "";
    }

    const { buildZwirkContext } = await import("@/lib/decision/brief");
    return buildZwirkContext(report);
  } catch {
    return "";
  }
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
  const [entityContext, setEntityContext] = useState<unknown>(null);

  const isApp = [
    "/today",
    "/dashboard",
    "/zooplens",
    "/brand-vault",
    "/records",
    "/zwirk",
  ].some((path) => pathname.startsWith(path));

  const send = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();

      if (!trimmed || loading) {
        return;
      }

      const nextMessages: ChatMessage[] = [
        ...messages,
        {
          role: "user",
          content: trimmed,
        },
      ];

      setMessages(nextMessages);
      setInput("");
      setLoading(true);
      setError(null);

      try {
        const reportContext = await getStoredZwirkContext();
        const res = await fetch("/api/zwirk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: nextMessages,
            context: reportContext || undefined,
            pagePath: pathname,
            entityContext,
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || "ZWIRK failed");
        }

        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: data.reply || "No response generated.",
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "ZWIRK failed");
      } finally {
        setLoading(false);
      }
    },
    [entityContext, loading, messages, pathname]
  );

  useEffect(() => {
    const supabase = createClient();

    // onAuthStateChange emits INITIAL_SESSION from local storage straight
    // away, so no network getUser() round trip is needed to show the dock.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session?.user));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const closePanel = useCallback(() => setOpen(false), []);
  const openFull = useCallback(() => router.push("/zwirk"), [router]);

  useEffect(() => {
    function onAsk(event: Event) {
      const prompt = (event as CustomEvent<string>).detail;

      if (!prompt?.trim()) {
        return;
      }

      setOpen(true);
      void send(prompt);
    }

    window.addEventListener("zooptrack:ask-zwirk", onAsk);

    return () => {
      window.removeEventListener("zooptrack:ask-zwirk", onAsk);
    };
  }, [send]);

  useEffect(() => {
    function onEntity(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail ?? null;

      setEntityContext(detail);
    }

    window.addEventListener("zooptrack:zwirk-entity", onEntity);

    return () => {
      window.removeEventListener("zooptrack:zwirk-entity", onEntity);
    };
  }, []);

  if (!authed || !isApp) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="zwirk-dock-fab"
        onClick={() => setOpen(true)}
        aria-label="Open ZWIRK"
      >
        Ask ZWIRK
      </button>

      {open ? (
        <ZwirkDockPanel
          contextLabel={pageContext(pathname)}
          entityLinked={Boolean(entityContext)}
          messages={messages}
          loading={loading}
          error={error}
          input={input}
          onInput={setInput}
          onSend={send}
          onClose={closePanel}
          onOpenFull={openFull}
        />
      ) : null}
    </>
  );
} 