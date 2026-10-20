import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/rate-limit";
import { takeAiCall } from "@/lib/ai/limits-server";
import { sanitizeZwirkInput } from "@/lib/zwirk/input-limits";
import { routeZwirkIntent } from "@/lib/zwirk/reasoning/intent-router";
import { buildSpecializedZwirkPrompt } from "@/lib/zwirk/prompts/context-prompt";
import { buildZwirkContext } from "@/lib/zwirk/context/context-builder";
import { thinkingConfigFor } from "@/lib/ai/gemini-config";
import { finalizeZwirkReply, type GeminiCandidate } from "@/lib/zwirk/reply";
import { loadRivalContext } from "@/lib/zwirk/rivals-server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GeminiGenerateResponse = {
  candidates?: GeminiCandidate[];
};

type ProofOfWork = {
  context: string;
  brandVault: string;
  assumptions: string[];
  competitiveContext?: string;
  adSpyContext?: string;
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

function formatBrandVault(
  row: BrandVaultRow
) {
  const items = [
    row.brand_name
      ? `Brand name: ${row.brand_name}`
      : null,

    row.website_url
      ? `Website: ${row.website_url}`
      : null,

    row.tone
      ? `Tone: ${row.tone}`
      : null,

    row.audience
      ? `Audience: ${row.audience}`
      : null,

    row.do_not_say
      ? `Do-not-say: ${row.do_not_say}`
      : null,

    row.hero_product
      ? `Hero product: ${row.hero_product}`
      : null,

    row.main_objection
      ? `Main objection: ${row.main_objection}`
      : null,

    row.competitor_focus
      ? `Competitor focus: ${row.competitor_focus}`
      : null,
  ].filter(Boolean);

  return items.length
    ? items.join("\n")
    : "No brand vault data provided.";
}

/** The last 12 turns as plain "User:" / "ZWIRK:" lines (the system prompt carries everything else). */
function formatConversation(messages: ChatMessage[]) {
  return messages
    .slice(-12)
    .map((msg) => `${msg.role === "assistant" ? "ZWIRK" : "User"}: ${msg.content.trim()}`)
    .join("\n");
}

function detectAssumptions(
  text: string
) {
  if (!text) {
    return [];
  }

  const matches =
    text.match(
      /[^.!?]*\bassum(?:ed|ing|es)?\b[^.!?]*[.!?]?/gi
    ) ?? [];

  const normalized =
    matches
      .map(
        (m) =>
          m
            .replace(/\s+/g, " ")
            .trim()
      )
      .filter(Boolean);

  return Array.from(
    new Set(normalized)
  ).slice(0, 4);
}

export async function POST(
  request: Request
) {
  const startedAt =
    Date.now();

  try {
    /*
     * --------------------------------------------------
     * 1. Authenticate user
     * --------------------------------------------------
     */
    const authClient =
      await createServerAuthClient();

    const {
      data: { user },
      error: userError,
    } =
      await authClient.auth.getUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // Every ZWIRK message costs an AI call: one limit across all servers.
    const zwirkRate = await checkSharedRateLimit(`zwirk:${user.id}`, 40, 3_600_000);
    if (!zwirkRate.allowed) {
      return NextResponse.json(
        { error: `You have sent a lot of messages this hour. Try again in ${Math.ceil(zwirkRate.retryAfterSeconds / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(zwirkRate.retryAfterSeconds) } },
      );
    }

    /*
     * --------------------------------------------------
     * 2. Read and cap the request body (before any AI allowance is spent)
     * --------------------------------------------------
     */
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const parsed = sanitizeZwirkInput(rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const {
      messages,
      competitorContext,
      adSpyContext,
      pagePath,
      entityContext,
      context: contextValue,
    } = parsed.input;

    // Daily AI allowance by plan (shared with report insights). Counted only for valid requests.
    const aiBlock = await takeAiCall(user.id, user.email ?? null);
    if (aiBlock) {
      return NextResponse.json(
        { error: aiBlock.message, code: "ai_daily_limit" },
        { status: 429, headers: { "Retry-After": String(aiBlock.retryAfterSeconds) } },
      );
    }

    /*
     * --------------------------------------------------
     * 3. Load Brand Vault
     * --------------------------------------------------
     */
    // Rival ads load in parallel (cached per user 10 min; "" on any failure).
    const rivalAdsPromise = loadRivalContext(user.id);

    const {
      data: brandVault,
      error: brandVaultError,
    } = await authClient
      .from("brand_vaults")
      .select(
        "brand_name,website_url,tone,audience,do_not_say,hero_product,main_objection,competitor_focus"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (
      brandVaultError
    ) {
      console.warn(
        `[api/zwirk] brand_vault lookup failed: ${brandVaultError.message}`
      );
    }

    /*
     * --------------------------------------------------
     * 4. Gemini configuration
     * --------------------------------------------------
     */
    const apiKey =
      process.env.GEMINI_API_KEY ||
      "";

    const rawModel =
      process.env.GEMINI_MODEL ||
      "";

    const model =
      rawModel.startsWith(
        "models/"
      )
        ? rawModel
        : `models/${rawModel}`;

    const timeoutMs =
      Number(
        process.env.GEMINI_TIMEOUT_MS ||
          25000
      );

    if (
      !apiKey ||
      !rawModel
    ) {
      return NextResponse.json(
        {
          error:
            "LLM not configured",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------
     * 5. Build prompt
     * --------------------------------------------------
     */
    const rivalAds = await rivalAdsPromise;
    const zwirkPageType =
      pagePath.startsWith("/zooplens")
        ? "adspy"
        : pagePath.startsWith("/brand-vault")
          ? "brand_vault"
          : pagePath.startsWith("/zwirk")
            ? "zwirk"
            : pagePath.startsWith("/dashboard")
              ? "dashboard"
              : pagePath.startsWith("/decision-loop")
                ? "decision_loop"
                : pagePath.startsWith("/pricing")
                  ? "pricing"
                  : pagePath.startsWith("/faq")
                    ? "faq"
                    : "dashboard";

    const pageContext =
      {
        page:
          zwirkPageType as Parameters<
            typeof buildZwirkContext
          >[0]["page"],

        label:
          zwirkPageType === "adspy"
            ? "ZoopLens"
            : zwirkPageType === "brand_vault"
              ? "Brand Vault"
              : zwirkPageType === "zwirk"
                ? "ZWIRK Workspace"
                : zwirkPageType === "dashboard"
                  ? "Growth Dashboard"
                  : zwirkPageType === "decision_loop"
                    ? "Decision Loop"
                    : zwirkPageType === "pricing"
                      ? "Pricing"
                      : zwirkPageType === "faq"
                        ? "FAQ"
                        : "Zooptrack",

        description:
          `Current Zooptrack page: ${pagePath || "/"}`,

        entity:
          entityContext
            ? entityContext as unknown as Parameters<
                typeof buildZwirkContext
              >[0]["entity"]
            : null,
      } satisfies Parameters<
        typeof buildZwirkContext
      >[0];

    const zwirkIntent =
      routeZwirkIntent(
        messages[messages.length - 1]
          ?.content ?? ""
      );

    const workspaceContext =
      {
        brandVault:
          brandVault
            ? {
                brand_name:
                  brandVault.brand_name,
                website_url:
                  brandVault.website_url,
                tone:
                  brandVault.tone,
                audience:
                  brandVault.audience,
                do_not_say:
                  brandVault.do_not_say,
                hero_product:
                  brandVault.hero_product,
                main_objection:
                  brandVault.main_objection,
                competitor_focus:
                  brandVault.competitor_focus,
              }
            : null,

        dashboard:
          contextValue ??
          null,

        competitiveContext:
          competitorContext ??
          null,

        adSpyContext:
          adSpyContext ??
          null,

        rivalAds:
          rivalAds ||
          null,

        history:
          null,

        experiments:
          null,
      } satisfies Parameters<
        typeof buildZwirkContext
      >[1];

    const zwirkContext =
      buildZwirkContext(
        pageContext,
        workspaceContext,
        zwirkIntent
      );

    const specializedPrompt =
      buildSpecializedZwirkPrompt(
        zwirkContext
      );

    // Context is written once (inside the specialized prompt), then the conversation.
    const prompt = [
      specializedPrompt,
      "",
      "CONVERSATION:",
      formatConversation(messages),
      "ZWIRK:",
    ].join("\n");

    /*
     * --------------------------------------------------
     * 6. Proof-of-work context
     * --------------------------------------------------
     */
    const proofContext =
      contextValue?.trim()
        ? contextValue.trim()
        : "No dashboard context provided.";

    const proofBrandVault =
      brandVault
        ? formatBrandVault(
            brandVault
          )
        : "No brand vault data provided.";

    const proofAssumptions:
      string[] = [];

    if (
      !contextValue ||
      !contextValue.trim()
    ) {
      proofAssumptions.push(
        "Dashboard context was missing, so default D2C benchmarks were used."
      );
    } else if (
      /n\/a/i.test(
        proofContext
      )
    ) {
      proofAssumptions.push(
        "Some dashboard metrics were unavailable (n/a), so healthy benchmarks were assumed."
      );
    }

    if (!brandVault) {
      proofAssumptions.push(
        "Brand Vault is empty, so a neutral voice was assumed."
      );
    }

    if (
      !adSpyContext ||
      !adSpyContext.trim()
    ) {
      proofAssumptions.push(
        "No current ZoopLens intelligence was attached to this ZWIRK request."
      );
    }

    /*
     * --------------------------------------------------
     * 7. Gemini API
     * --------------------------------------------------
     */
    const baseUrl =
      "https://generativelanguage.googleapis.com";

    const modelName =
      model.replace(/^models\//, "");

    // One stable endpoint; the key travels in a header, never in the URL.
    const endpoint =
      `${baseUrl}/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;

    const callGemini = async (generationConfig: Record<string, unknown>) => {
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      };
      const maxAttempts = 2;
      let res: Response | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        // Retry only on rate limit / overload; anything else is final.
        if ((res.status === 429 || res.status === 503) && attempt < maxAttempts) {
          console.warn(`[api/zwirk] Gemini ${res.status}. Retrying once...`);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        break;
      }
      if (!res) throw new Error("Gemini request failed.");
      return res;
    };

    /*
     * --------------------------------------------------
     * 8. Primary Gemini request
     * --------------------------------------------------
     */
    // Thinking tokens count against maxOutputTokens: off for flash, minimum for pro.
    const thinkingConfig = thinkingConfigFor(modelName);
    const res = await callGemini({
      maxOutputTokens: 2048,
      temperature: 0.4,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    });

    /*
     * --------------------------------------------------
     * 9. Handle Gemini error (details stay in server logs only)
     * --------------------------------------------------
     */
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error(
        `[api/zwirk] Gemini error status=${res.status} model=${modelName} body=${errorText.slice(0, 500)}`
      );
      const busy = res.status === 429 || res.status === 503;
      return NextResponse.json(
        {
          error: busy
            ? "ZWIRK is busy right now. Please try again in a few seconds."
            : "ZWIRK could not answer right now. Please try again.",
          retryable: busy,
        },
        { status: busy ? 503 : 502 }
      );
    }

    /*
     * --------------------------------------------------
     * 10. Parse Gemini response
     * --------------------------------------------------
     */
    const data =
      (await res.json()) as GeminiGenerateResponse;

    // Strips leftover evidence tags; notes when the answer hit MAX_TOKENS.
    const result =
      finalizeZwirkReply(data.candidates?.[0]);

    const reply =
      result.reply;

    const rawText =
      result.raw;

    /*
     * --------------------------------------------------
     * 11. Detect assumptions
     * --------------------------------------------------
     */
    detectAssumptions(
      rawText
    ).forEach(
      (sentence) => {
        if (
          sentence &&
          !proofAssumptions.includes(
            sentence
          )
        ) {
          proofAssumptions.push(
            sentence
          );
        }
      }
    );

    /*
     * --------------------------------------------------
     * 12. Build proof
     * --------------------------------------------------
     */
    const proof: ProofOfWork =
      {
        context:
          proofContext,

        brandVault:
          proofBrandVault,

        assumptions:
          proofAssumptions,

        competitiveContext:
          competitorContext?.trim()
            ? competitorContext.trim()
            : undefined,

        adSpyContext:
          adSpyContext?.trim()
            ? adSpyContext.trim()
            : undefined,
      };

    /*
     * --------------------------------------------------
     * 13. Return response
     * --------------------------------------------------
     */
    return NextResponse.json({
      reply,
      latencyMs:
        Date.now() -
        startedAt,
      proof,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error(
      `[api/zwirk] failed: ${error instanceof Error ? error.message : String(error)}`
    );

    return NextResponse.json(
      {
        error: aborted
          ? "ZWIRK took too long to answer. Please try again."
          : "ZWIRK could not answer right now. Please try again.",
      },
      {
        status: 500,
      }
    );
  } finally {
    console.info(
      `[api/zwirk] completed in ${
        Date.now() -
        startedAt
      }ms`
    );
  }
}