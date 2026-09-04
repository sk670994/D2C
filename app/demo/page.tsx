"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const starterPrompts = [
  "Diagnose a D2C skincare brand with 2.8 ROAS and 30% margin.",
  "Plan a 30-day Meta + Google spend for a face wash launch."
];

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ProofOfWork = {
  context: string;
  brandVault: string;
  assumptions: string[];
};

const sampleContext =
  "Contribution margin: 34.2%, Max allowable CAC: INR 1,850, Blended ROAS: 3.6x, Readiness: READY TO SCALE";
const sampleBrandVault =
  "Brand: Kapture Labs • Tone: Bold & technical • Audience: Male/female 18-35 urban shoppers • Do not say: cheap, generic.";

export default function DemoPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "I'm ZWIRK Demo. Type a question about ROAS, CAC, or scaling."
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [proof, setProof] = useState<ProofOfWork | null>(null);

  const chatHistory = useMemo(() => messages.filter((msg) => msg.content.trim().length > 0), [messages]);
  const canSend = input.trim().length > 0 && !loading;

  async function sendMessage(message: string) {
    setLoading(true);
    const nextMessage: ChatMessage = { role: "user", content: message };
    const next = [...messages, nextMessage];
    setMessages(next);
    setInput("");

    try {
      const res = await fetch("/api/demo/zwirk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next })
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setProof(data.proof ?? null);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Demo assistant is unavailable right now." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="main zwirk-page demo-page">
      <header className="zwirk-hero">
        <div>
          <p className="eyebrow">Demo Mode</p>
          <h1>ZWIRK Demo</h1>
          <p className="muted-text">
            This demo is public. Type anything about ROAS, CAC, or scaling and watch how ZWIRK responds with proof.
          </p>
        </div>
      </header>

      <section className="zwirk-chat surface">
        <div className="zwirk-chat-header">
          <h2>Conversation</h2>
          <span className="status-dot">{loading ? "Thinking..." : "Ready"}</span>
        </div>
        <div className="zwirk-messages">
          {chatHistory.map((msg, idx) => (
            <div key={`${msg.role}-${idx}`} className={`zwirk-message-group ${msg.role}`}>
              <div className={`zwirk-message ${msg.role}`}>
                <span>{msg.content}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="zwirk-input">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about ROAS, CAC, margins..."
            rows={3}
          />
          <Button type="button" onClick={() => sendMessage(input)} disabled={!canSend}>
            {loading ? "Sending..." : "Send to Demo ZWIRK"}
          </Button>
        </div>
        <div className="proof-panel">
          <h3>Proof of Work</h3>
          <p>
            Context: <strong>{proof?.context ?? sampleContext}</strong>
          </p>
          <p>
            Brand Vault: <strong>{proof?.brandVault ?? sampleBrandVault}</strong>
          </p>
          <p>
            Assumptions: {proof?.assumptions.length ? proof.assumptions.join(" | ") : "No assumptions detected."}
          </p>
        </div>
        <div className="starter-grid">
          {starterPrompts.map((prompt) => (
            <button key={prompt} type="button" className="zwirk-prompt" onClick={() => sendMessage(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
