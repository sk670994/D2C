import { NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

function buildPrompt(messages: ChatMessage[], context?: string) {
  const trimmed = messages.slice(-12).map((msg) => {
    const role = msg.role === "assistant" ? "ZWIRK" : "User";
    return `${role}: ${msg.content.trim()}`;
  });
  return [
    "You are ZWIRK, a sharp virtual assistant for DTC operators.",
    "Provide concise, actionable answers with concrete steps. Use numbers where possible.",
    "Ask one clarifying question only if it is required to answer.",
    "Respond with the answer only. Do not include role labels like 'ZWIRK:' or 'User:'.",
    "If you are unsure, say so.",
    context ? `Context:\n${context}` : "",
    "",
    ...trimmed,
    "Answer:"
  ].join("\n");
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const authClient = await createServerAuthClient();
    const {
      data: { user },
      error: userError
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { messages?: ChatMessage[]; context?: string };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || "";
    const rawModel = process.env.GEMINI_MODEL || "";
    const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;
    const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 25000);

    if (!apiKey || !rawModel) {
      return NextResponse.json({ error: "LLM not configured" }, { status: 500 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const prompt = buildPrompt(messages, typeof body.context === "string" ? body.context : undefined);
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 900
      }
    };

    const baseUrl = "https://generativelanguage.googleapis.com";
    const modelPath = `/models/${model.replace(/^models\//, "")}:generateContent?key=${apiKey}`;

    let endpoint = `${baseUrl}/v1beta${modelPath}`;
    let res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!res.ok && res.status === 404) {
      endpoint = `${baseUrl}/v1${modelPath}`;
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    }

    clearTimeout(timeout);

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        {
          error: "LLM error",
          status: res.status,
          detail: errorText || "No error body returned",
          model,
          endpoint
        },
        { status: res.status }
      );
    }

    const data = (await res.json()) as GeminiGenerateResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const rawReply = parts.map((part) => part.text ?? "").join("").trim() || "No response generated.";
    const reply = rawReply.replace(/^ZWIRK:\s*/i, "").replace(/\nUser:.*$/s, "").trim();

    return NextResponse.json({ reply, latencyMs: Date.now() - startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZWIRK error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    console.info(`[api/zwirk] completed in ${Date.now() - startedAt}ms`);
  }
}








