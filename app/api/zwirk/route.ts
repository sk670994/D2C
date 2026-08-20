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
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
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

function formatBrandVault(row: BrandVaultRow): string {
  const items = [
    row.brand_name ? `Brand name: ${row.brand_name}` : null,
    row.website_url ? `Website: ${row.website_url}` : null,
    row.tone ? `Tone: ${row.tone}` : null,
    row.audience ? `Audience: ${row.audience}` : null,
    row.do_not_say ? `Do-not-say: ${row.do_not_say}` : null,
    row.hero_product ? `Hero product: ${row.hero_product}` : null,
    row.main_objection
      ? `Main objection: ${row.main_objection}`
      : null,
    row.competitor_focus
      ? `Competitor focus: ${row.competitor_focus}`
      : null,
  ].filter(Boolean) as string[];

  return items.length > 0
    ? items.join("\n")
    : "No brand vault data provided.";
}

function buildPrompt(
  messages: ChatMessage[],
  context?: string,
  competitorContext?: string,
  brandVault?: BrandVaultRow
): string {
  const trimmedMessages = messages.slice(-12).map((msg) => {
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
    "",
    "Goal:",
    "Provide outcome-focused, specific, practical guidance that a DTC founder can implement.",
    "",
    "IMPORTANT:",
    "Use the Context block as facts.",
    "Do not contradict dashboard data.",
    "Do not invent metrics that are not present.",
    "If metrics are missing and they are necessary for the question, clearly state which metrics are missing.",
    "If enough context exists, analyze it directly instead of asking the user to repeat information already present in Context.",
    "Respond with the answer only.",
    "Do not include role labels such as 'ZWIRK:' or 'User:'.",
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
    competitorContext?.trim() || "No competitor radar data provided.",
    "",
    "Conversation:",
    ...trimmedMessages,
    "",
    "Required output format:",
    "",
    "Summary:",
    "- Give the biggest problem first.",
    "- Give 2-3 concise supporting points.",
    "",
    "30-Day Plan:",
    "Week 1:",
    "- Concrete actions.",
    "",
    "Week 2:",
    "- Concrete actions.",
    "",
    "Week 3:",
    "- Concrete actions.",
    "",
    "Week 4:",
    "- Concrete actions.",
    "",
    "Metrics to Monitor:",
    "- 4-6 metrics.",
    "",
    "Answer:",
  ].join("\n");
}

function extractReply(data: GeminiGenerateResponse): {
  reply: string;
  raw: string;
} {
  const parts = data.candidates?.[0]?.content?.parts ?? [];

  const rawReply = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  const reply = rawReply
    .replace(/^ZWIRK:\s*/i, "")
    .replace(/\nUser:\s*[\s\S]*$/i, "")
    .trim();

  return {
    reply: reply || "No response generated.",
    raw: rawReply,
  };
}

function detectAssumptions(text: string): string[] {
  if (!text) return [];

  const matches =
    text.match(
      /[^.!?]*\b(?:assumed|assuming|assumes)\b[^.!?]*[.!?]?/gi
    ) ?? [];

  const normalized = matches
    .map((match) => match.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return Array.from(new Set(normalized)).slice(0, 4);
}

async function callGemini(
  prompt: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
  maxOutputTokens: number
): Promise<{
  res: Response;
  endpoint: string;
}> {
  const modelName = model.replace(/^models\//, "");

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
    generationConfig: {
      maxOutputTokens,
      temperature: 0.4,
    },
  };

  const versions = ["v1beta", "v1"];

  let lastResponse: Response | null = null;
  let lastEndpoint = "";

  for (const version of versions) {
    const endpoint =
      `https://generativelanguage.googleapis.com/${version}` +
      `/models/${modelName}:generateContent?key=${apiKey}`;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      lastResponse = response;
      lastEndpoint = endpoint;

      if (response.ok) {
        return {
          res: response,
          endpoint,
        };
      }

      // Try the second API version only for 404.
      if (response.status !== 404) {
        break;
      }
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Gemini request timed out after ${timeoutMs}ms`
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!lastResponse) {
    throw new Error("Unable to connect to Gemini API.");
  }

  return {
    res: lastResponse,
    endpoint: lastEndpoint,
  };
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
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
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

    const contextValue =
      typeof body.context === "string"
        ? body.context
        : undefined;

    const competitorContext =
      typeof body.competitorContext === "string"
        ? body.competitorContext
        : undefined;

    if (messages.length === 0) {
      return NextResponse.json(
        {
          error: "No messages provided",
        },
        {
          status: 400,
        }
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

    const apiKey = process.env.GEMINI_API_KEY?.trim();

    /*
     * Keep the model configurable through Vercel.
     *
     * If GEMINI_MODEL is missing, use the model currently
     * configured for your application.
     */
    const rawModel =
      process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

    const model = rawModel.replace(/^models\//, "");

    const timeoutMs = Number(
      process.env.GEMINI_TIMEOUT_MS || 25000
    );

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "LLM not configured",
          detail: "GEMINI_API_KEY is missing.",
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------
    // 5. Build prompt
    // --------------------------------------------------

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
      contextValue?.trim() ||
      "No dashboard context provided.";

    const proofBrandVault = brandVault
      ? formatBrandVault(brandVault)
      : "No brand vault data provided.";

    const proofAssumptions: string[] = [];

    if (!contextValue?.trim()) {
      proofAssumptions.push(
        "Dashboard context was missing."
      );
    }

    if (/n\/a/i.test(proofContext)) {
      proofAssumptions.push(
        "Some dashboard metrics were unavailable (n/a)."
      );
    }

    if (!brandVault) {
      proofAssumptions.push(
        "Brand Vault is empty, so a neutral brand voice was used."
      );
    }

    // --------------------------------------------------
    // 7. Primary Gemini request
    // --------------------------------------------------

    let { res, endpoint } = await callGemini(
      prompt,
      apiKey,
      model,
      timeoutMs,
      1200
    );

    // --------------------------------------------------
    // 8. Handle Gemini error
    // --------------------------------------------------

    if (!res.ok) {
      const errorText = await res.text();

      console.error("[api/zwirk] Gemini error:", {
        status: res.status,
        model,
        endpoint,
        detail: errorText,
      });

      return NextResponse.json(
        {
          error: "LLM error",
          status: res.status,
          detail:
            errorText || "No error body returned.",
          model,
          endpoint,
        },
        {
          status: res.status,
        }
      );
    }

    // --------------------------------------------------
    // 9. Parse response
    // --------------------------------------------------

    let data =
      (await res.json()) as GeminiGenerateResponse;

    let result = extractReply(data);

    let reply = result.reply;
    let rawText = result.raw;

    // --------------------------------------------------
    // 10. Retry if response is too short
    // --------------------------------------------------

    if (reply.length < 400) {
      const retry = await callGemini(
        prompt,
        apiKey,
        model,
        timeoutMs,
        1500
      );

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
    // 11. Detect assumptions
    // --------------------------------------------------

    detectAssumptions(rawText).forEach((sentence) => {
      if (
        sentence &&
        !proofAssumptions.includes(sentence)
      ) {
        proofAssumptions.push(sentence);
      }
    });

    // --------------------------------------------------
    // 12. Build proof
    // --------------------------------------------------

    const proof: ProofOfWork = {
      context: proofContext,
      brandVault: proofBrandVault,
      assumptions: proofAssumptions,
      competitiveContext:
        competitorContext?.trim() || undefined,
    };

    // --------------------------------------------------
    // 13. Return response
    // --------------------------------------------------

    return NextResponse.json({
      reply,
      latencyMs: Date.now() - startedAt,
      proof,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ZWIRK error";

    console.error("[api/zwirk] unexpected error:", error);

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