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
  competitiveContext?: string;
};

type BrandVaultRow = {
  brand_name: string | null;
  website_url: string | null;
  tone: string | null;
  audience: string | null;
  do_not_say: string | null;
  hero_product: string | null;
  main_objection: string | null;
  competitor_focus: string | null;
};

function formatBrandVault(row: BrandVaultRow) {
  const items = [
    row.brand_name ? `Brand name: ${row.brand_name}` : null,
    row.website_url ? `Website: ${row.website_url}` : null,
    row.tone ? `Tone: ${row.tone}` : null,
    row.audience ? `Audience: ${row.audience}` : null,
    row.do_not_say ? `Do-not-say: ${row.do_not_say}` : null,
    row.hero_product ? `Hero product: ${row.hero_product}` : null,
    row.main_objection ? `Main objection: ${row.main_objection}` : null,
    row.competitor_focus
      ? `Competitor focus: ${row.competitor_focus}`
      : null,
  ].filter(Boolean);

  return items.length
    ? items.join("\n")
    : "No brand vault data provided.";
}

function buildPrompt(
  messages: ChatMessage[],
  context?: string,
  competitorContext?: string,
  brandVault?: BrandVaultRow
) {
  const trimmed = messages.slice(-12).map((msg) => {
    const role = msg.role === "assistant" ? "ZWIRK" : "User";
    return `${role}: ${msg.content.trim()}`;
  });

  const lockedContext =
    context && context.trim().length > 0
      ? context.trim()
      : "No dashboard context provided.";

  const lockedVault = brandVault
    ? formatBrandVault(brandVault)
    : "No brand vault data provided.";

  const lockedCompetitors =
    brandVault?.competitor_focus?.trim().length
      ? brandVault.competitor_focus.trim()
      : "No competitor focus provided.";

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
    "Competitor Focus (locked):",
    lockedCompetitors,
    "",
    "Competitive radar (locked):",
    competitorContext ?? "No competitor radar data provided.",
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
    "Answer:",
  ].join("\n");
}

function extractReply(data: GeminiGenerateResponse) {
  const parts = data.candidates?.[0]?.content?.parts ?? [];

  const rawReply =
    parts
      .map((part) => part.text ?? "")
      .join("")
      .trim() || "No response generated.";

  return {
    reply: rawReply
      .replace(/^ZWIRK:\s*/i, "")
      .replace(/\nUser:.*$/s, "")
      .trim(),

    raw: rawReply,
  };
}

function detectAssumptions(text: string) {
  if (!text) return [];

  const matches =
    text.match(
      /[^.!?]*\bassum(?:ed|ing|es)?\b[^.!?]*[.!?]?/gi
    ) ?? [];

  const normalized = matches
    .map((m) => m.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return Array.from(new Set(normalized)).slice(0, 4);
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    // --------------------------------------------------
    // 1. Authenticate user
    // --------------------------------------------------

    const authClient = await createServerAuthClient();

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. Read request body
    // --------------------------------------------------

    const body = (await request.json()) as {
      messages?: ChatMessage[];
      context?: string;
      competitorContext?: string;
    };

    const messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    const competitorContext =
      typeof body.competitorContext === "string"
        ? body.competitorContext
        : undefined;

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 3. Load Brand Vault
    // --------------------------------------------------

    const {
      data: brandVault,
      error: brandVaultError,
    } = await authClient
      .from("brand_vaults")
      .select(
        "brand_name,website_url,tone,audience,do_not_say,hero_product,main_objection,competitor_focus"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (brandVaultError) {
      console.warn(
        `[api/zwirk] brand_vault lookup failed: ${brandVaultError.message}`
      );
    }

    // --------------------------------------------------
    // 4. Gemini configuration
    // --------------------------------------------------

    const apiKey = process.env.GEMINI_API_KEY || "";

    const rawModel = process.env.GEMINI_MODEL || "";

    const model = rawModel.startsWith("models/")
      ? rawModel
      : `models/${rawModel}`;

    const timeoutMs = Number(
      process.env.GEMINI_TIMEOUT_MS || 25000
    );

    if (!apiKey || !rawModel) {
      return NextResponse.json(
        { error: "LLM not configured" },
        { status: 500 }
      );
    }

    // --------------------------------------------------
    // 5. Build prompt
    // --------------------------------------------------

    const contextValue =
      typeof body.context === "string"
        ? body.context
        : undefined;

    const prompt = buildPrompt(
      messages,
      contextValue,
      competitorContext,
      brandVault ?? undefined
    );

    // --------------------------------------------------
    // 6. Proof-of-work context
    // --------------------------------------------------

    const proofContext =
      contextValue?.trim()
        ? contextValue.trim()
        : "No dashboard context provided.";

    const proofBrandVault = brandVault
      ? formatBrandVault(brandVault)
      : "No brand vault data provided.";

    const proofAssumptions: string[] = [];

    if (!contextValue || !contextValue.trim()) {
      proofAssumptions.push(
        "Dashboard context was missing, so default D2C benchmarks were used."
      );
    } else if (/n\/a/i.test(proofContext)) {
      proofAssumptions.push(
        "Some dashboard metrics were unavailable (n/a), so healthy benchmarks were assumed."
      );
    }

    if (!brandVault) {
      proofAssumptions.push(
        "Brand Vault is empty, so a neutral voice was assumed."
      );
    }

    // --------------------------------------------------
    // 7. Gemini API
    // --------------------------------------------------

    const baseUrl =
      "https://generativelanguage.googleapis.com";

    const modelPath =
      `/models/${model.replace(/^models\//, "")}` +
      `:generateContent?key=${apiKey}`;

    const callGemini = async (generationConfig: {
      maxOutputTokens: number;
    }) => {
      const controller = new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        timeoutMs
      );

      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],

        generationConfig,
      };

      // Try v1beta first
      let endpoint =
        `${baseUrl}/v1beta${modelPath}`;

      let res = await fetch(endpoint, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),

        signal: controller.signal,
      });

      // Fallback to v1 if v1beta returns 404
      if (!res.ok && res.status === 404) {
        endpoint =
          `${baseUrl}/v1${modelPath}`;

        res = await fetch(endpoint, {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),

          signal: controller.signal,
        });
      }

      clearTimeout(timeout);

      return {
        res,
        endpoint,
      };
    };

    // --------------------------------------------------
    // 8. Primary Gemini request
    // --------------------------------------------------

    const primaryConfig = {
      maxOutputTokens: 1200,
    };

    let { res, endpoint } =
      await callGemini(primaryConfig);

    // --------------------------------------------------
    // 9. Handle Gemini error
    // --------------------------------------------------

    if (!res.ok) {
      const errorText = await res.text();

      return NextResponse.json(
        {
          error: "LLM error",

          status: res.status,

          detail:
            errorText ||
            "No error body returned",

          model,

          endpoint,
        },
        {
          status: res.status,
        }
      );
    }

    // --------------------------------------------------
    // 10. Parse Gemini response
    // --------------------------------------------------

    let data =
      (await res.json()) as GeminiGenerateResponse;

    let result = extractReply(data);

    let reply = result.reply;

    let rawText = result.raw;

    // --------------------------------------------------
    // 11. Retry if response is too short
    // --------------------------------------------------

    if (reply.length < 400) {
      const retryConfig = {
        maxOutputTokens: 1500,
      };

      const retry =
        await callGemini(retryConfig);

      if (retry.res.ok) {
        endpoint = retry.endpoint;

        data =
          (await retry.res.json()) as GeminiGenerateResponse;

        result = extractReply(data);

        reply = result.reply;

        rawText = result.raw;
      }
    }

    // --------------------------------------------------
    // 12. Detect assumptions
    // --------------------------------------------------

    detectAssumptions(rawText).forEach(
      (sentence) => {
        if (
          sentence &&
          !proofAssumptions.includes(sentence)
        ) {
          proofAssumptions.push(sentence);
        }
      }
    );

    // --------------------------------------------------
    // 13. Build proof
    // --------------------------------------------------

    const proof: ProofOfWork = {
      context: proofContext,

      brandVault: proofBrandVault,

      assumptions: proofAssumptions,

      competitiveContext:
        competitorContext?.trim()
          ? competitorContext.trim()
          : undefined,
    };

    // --------------------------------------------------
    // 14. Return response
    // --------------------------------------------------

    return NextResponse.json({
      reply,

      latencyMs:
        Date.now() - startedAt,

      proof,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ZWIRK error";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      }
    );
  } finally {
    console.info(
      `[api/zwirk] completed in ${
        Date.now() - startedAt
      }ms`
    );
  }
}