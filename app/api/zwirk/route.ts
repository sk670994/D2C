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

type ProofOfWork = {
  context: string;
  brandVault: string;
  assumptions: string[];
};


type BrandVaultRow = {
  brand_name: string | null;
  website_url: string | null;
  tone: string | null;
  audience: string | null;
  do_not_say: string | null;
  hero_product: string | null;
  main_objection: string | null;
};

function formatBrandVault(row: BrandVaultRow) {
  const items = [
    row.brand_name ? `Brand name: ${row.brand_name}` : null,
    row.website_url ? `Website: ${row.website_url}` : null,
    row.tone ? `Tone: ${row.tone}` : null,
    row.audience ? `Audience: ${row.audience}` : null,
    row.do_not_say ? `Do-not-say: ${row.do_not_say}` : null,
    row.hero_product ? `Hero product: ${row.hero_product}` : null,
    row.main_objection ? `Main objection: ${row.main_objection}` : null
  ].filter(Boolean);
  return items.length ? items.join("\n") : "No brand vault data provided.";
}

function buildPrompt(messages: ChatMessage[], context?: string, brandVault?: BrandVaultRow) {
  const trimmed = messages.slice(-12).map((msg) => {
    const role = msg.role === "assistant" ? "ZWIRK" : "User";
    return `${role}: ${msg.content.trim()}`;
  });
  const lockedContext = context && context.trim().length > 0 ? context.trim() : "No dashboard context provided.";
  const lockedVault = brandVault ? formatBrandVault(brandVault) : "No brand vault data provided.";
  return [
    "You are ZWIRK, a sharp virtual assistant for DTC operators.",
    "Goal: Provide outcome-focused, specific, and practical guidance a founder can implement.",
    "If key metrics are missing for the request (ROAS, CAC, AOV, margin, order volume), ask for them first and do not give a plan yet.",
    "Use the Context block as facts. Do not contradict it.",
    "Respond with the answer only. Do not include role labels like 'ZWIRK:' or 'User:'.",
    "If you are unsure, say so.",
    "",
    "Context (locked):",
    lockedContext,
    "",
    "Brand Vault (locked):",
    lockedVault,
    "",
    "Required output format:",
    "Summary:",
    "- 2-3 bullet points with the main diagnosis",
    "",
    "30-Day Plan:",
    "Week 1:",
    "- bullet steps",
    "Week 2:",
    "- bullet steps",
    "Week 3:",
    "- bullet steps",
    "Week 4:",
    "- bullet steps",
    "",
    "Metrics to Monitor:",
    "- 4-6 bullets",
    "",
    ...trimmed,
    "Answer:"
  ].join("\n");
}

function extractReply(data: GeminiGenerateResponse) {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const rawReply = parts.map((part) => part.text ?? "").join("").trim() || "No response generated.";
  return rawReply.replace(/^ZWIRK:\s*/i, "").replace(/\nUser:.*$/s, "").trim();
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

    const { data: brandVault, error: brandVaultError } = await authClient
      .from("brand_vaults")
      .select("brand_name,website_url,tone,audience,do_not_say,hero_product,main_objection")
      .eq("user_id", user.id)
      .maybeSingle();

    if (brandVaultError) {
      console.warn(`[api/zwirk] brand_vault lookup failed: ${brandVaultError.message}`);
    }

    const apiKey = process.env.GEMINI_API_KEY || "";
    const rawModel = process.env.GEMINI_MODEL || "";
    const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;
    const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 25000);

    if (!apiKey || !rawModel) {
      return NextResponse.json({ error: "LLM not configured" }, { status: 500 });
    }

    const prompt = buildPrompt(messages, contextValue, brandVault ?? undefined);
    const baseUrl = "https://generativelanguage.googleapis.com";
    const modelPath = `/models/${model.replace(/^models\//, "")}:generateContent?key=${apiKey}`;

    const callGemini = async (generationConfig: { temperature: number; maxOutputTokens: number }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig
      };

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
      return { res, endpoint };
    };

    const primaryConfig = { temperature: 0.35, maxOutputTokens: 1200 };
    let { res, endpoint } = await callGemini(primaryConfig);

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

    let data = (await res.json()) as GeminiGenerateResponse;
    let reply = extractReply(data);

    if (reply.length < 400) {
      const retryConfig = { temperature: 0.2, maxOutputTokens: 1500 };
      const retry = await callGemini(retryConfig);
      if (retry.res.ok) {
        endpoint = retry.endpoint;
        data = (await retry.res.json()) as GeminiGenerateResponse;
        reply = extractReply(data);
      }
    }

    return NextResponse.json({ reply, latencyMs: Date.now() - startedAt, proof });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZWIRK error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    console.info(`[api/zwirk] completed in ${Date.now() - startedAt}ms`);
  }
}









