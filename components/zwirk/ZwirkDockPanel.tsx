"use client";

import { Button } from "@/components/ui/button";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function ZwirkDockPanel({
  contextLabel,
  entityLinked,
  messages,
  loading,
  error,
  input,
  onInput,
  onSend,
  onClose,
  onOpenFull,
}: {
  contextLabel: string;
  entityLinked: boolean;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  input: string;
  onInput: (value: string) => void;
  onSend: (prompt: string) => void | Promise<void>;
  onClose: () => void;
  onOpenFull: () => void;
}) {
  return (
    <div className="zwirk-dock">
      <header>
        <div>
          <strong>✦ ZWIRK</strong>
          <span>Growth Intelligence Copilot</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </header>

      <p className="zwirk-dock-context">
        Context · {contextLabel}
        {entityLinked ? " · Entity linked" : ""}
      </p>

      <div className="zwirk-dock-thread">
        {messages.length === 0 ? (
          <p className="muted-text">
            Ask why profit moved, what to pause, or what to test next. I
            will not invent metrics.
          </p>
        ) : null}

        {messages.map((msg, index) => (
          <article
            key={`${msg.role}-${index}`}
            className={`zwirk-dock-msg ${msg.role}`}
          >
            {msg.content}
          </article>
        ))}

        {loading ? (
          <p className="muted-text">Working…</p>
        ) : null}

        {error ? (
          <p className="error-text">{error}</p>
        ) : null}
      </div>

      <form
        className="zwirk-dock-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSend(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => onInput(event.target.value)}
          placeholder="Ask ZWIRK…"
          aria-label="Ask ZWIRK"
          disabled={loading}
        />

        <Button type="submit" disabled={loading || !input.trim()}>
          ↑
        </Button>
      </form>

      <button
        type="button"
        className="zwirk-dock-full"
        onClick={onOpenFull}
      >
        Open full workspace
      </button>
    </div>
  );
}
