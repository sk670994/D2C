import { NextResponse } from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

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

function buildPrompt(
  messages: ChatMessage[],
  context?: string,
  competitorContext?: string,
  brandVault?: BrandVaultRow,
  adSpyContext?: string
) {
  const trimmed = messages
    .slice(-12)
    .map((msg) => {
      const role =
        msg.role === "assistant"
          ? "ZWIRK"
          : "User";

      return `${role}: ${msg.content.trim()}`;
    });

  const lockedContext =
    context &&
    context.trim().length > 0
      ? context.trim()
      : "No dashboard context provided.";

  const lockedVault =
    brandVault
      ? formatBrandVault(
          brandVault
        )
      : "No brand vault data provided.";

  const lockedCompetitors =
    brandVault?.competitor_focus
      ?.trim().length
      ? brandVault.competitor_focus.trim()
      : "No competitor focus provided.";

  const lockedAdSpy =
    adSpyContext &&
    adSpyContext.trim().length > 0
      ? adSpyContext.trim()
      : "No AdSpy intelligence is currently available.";

  return [
    "You are ZWIRK, a sharp virtual assistant for DTC operators.",

    "Goal: Provide outcome-focused, specific, practical guidance that a founder can implement.",

    "",

    "CORE BEHAVIOR:",

    "Use the metrics available in the Context block first.",

    "Use the AdSpy intelligence when the question involves competitors, competitor ads, creative strategy, offers, hooks, creators, positioning, creative longevity, market patterns, or what the brand should test next.",

    "Combine first-party business performance with competitor intelligence whenever both are relevant.",

    "Do not stop and ask the user for missing metrics if a useful recommendation can still be made.",

    "Only ask for additional metrics when they are absolutely required to answer the question accurately.",

    "If a metric such as AOV or order volume is unavailable, explicitly state that it is unavailable and continue using the available dashboard metrics.",

    "Never refuse to provide a useful analysis or plan merely because one or more metrics are missing.",

    "Clearly distinguish dashboard facts, AdSpy observations, and assumptions.",

    "Do not invent dashboard metrics, campaign performance, revenue, CAC, ROAS, margins, orders, clicks, CTR, impressions, or other business data.",

    "When data is unavailable, say 'not available' or make a clearly labeled reasonable assumption.",

    "Use INR formatting when discussing Indian currency.",

    "",

    "DECISION PRINCIPLES:",

    "Prioritize profitability over vanity metrics.",

    "Use contribution margin, allowable CAC, blended CAC, ROAS, revenue, and net profit when available.",

    "When recommending scaling, do not recommend aggressive scaling if CAC is above allowable CAC or profitability is deteriorating.",

    "When recommending budget increases, prioritize proven profitable campaigns before expanding into unproven campaigns.",

    "When data suggests a problem, identify the likely root cause before recommending actions.",

    "Give concrete actions rather than generic marketing advice.",

    "",

    "ADSPY INTERPRETATION RULES:",

    "AdSpy contains public competitor intelligence observed from the Meta Ad Library.",

    "AdSpy creative score, longevity score, relevance score, and engagement potential are estimates or derived signals unless explicitly stated otherwise.",

    "Never describe engagement potential as actual engagement, clicks, CTR, impressions, spend, conversions, revenue, ROAS, or profit.",

    "Treat running days as an observed longevity signal, not proof that a competitor ad is profitable.",

    "Treat recurring offers, hooks, creators, products, formats, and creative families as market patterns.",

    "Do not recommend copying competitor creatives verbatim.",

    "Recommend differentiated tests based on observed patterns.",

    "When comparing competitor ads, cite the specific product, offer, hook, format, creator, longevity or score that supports the recommendation.",

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
    competitorContext ??
      "No competitor radar data provided.",

    "",

    "AdSpy intelligence (locked):",
    lockedAdSpy,

    "",

    "RESPONSE STYLE:",

    "Be concise, direct, and founder-friendly.",

    "Do not include role labels such as 'ZWIRK:' or 'User:'.",

    "Do not repeat the user's question.",

    "Do not fabricate certainty.",

    "Tag material statements as FACT, DERIVED, OBSERVED, ASSUMPTION, or RECOMMENDATION.",

    "If you make an assumption, clearly label it.",

    "",

    "RESPONSE STRUCTURE:",

    "Start with:",

    "Summary:",

    "- 2-3 bullets containing the main diagnosis or answer.",

    "",

    "If the user asks for a plan, include:",

    "30-Day Plan:",

    "Week 1:",

    "- concrete actions",

    "Week 2:",

    "- concrete actions",

    "Week 3:",

    "- concrete actions",

    "Week 4:",

    "- concrete actions",

    "",

    "If the user asks for analysis, diagnosis, comparison, or explanation rather than a plan, do not force a 30-day plan.",

    "",

    "When relevant, finish with:",

    "Metrics to Monitor:",

    "- 4-6 important metrics.",

    "",

    "Use actual numbers from the Context whenever available.",

    "Use actual AdSpy observations whenever relevant.",

    "Explain why each major recommendation matters.",

    "",

    ...trimmed,

    "Answer:",
  ].join("\n");
}

function extractReply(
  data: GeminiGenerateResponse
) {
  const parts =
    data.candidates?.[0]?.content
      ?.parts ?? [];

  const rawReply =
    parts
      .map(
        (part) =>
          part.text ?? ""
      )
      .join("")
      .trim() ||
    "No response generated.";

  return {
    reply: rawReply
      .replace(
        /^ZWIRK:\s*/i,
        ""
      )
      .replace(
        /\nUser:.*$/s,
        ""
      )
      .trim(),

    raw: rawReply,
  };
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

    /*
     * --------------------------------------------------
     * 2. Read request body
     * --------------------------------------------------
     */
    const body =
      (await request.json()) as {
        messages?: ChatMessage[];
        context?: string;
        competitorContext?: string;
        adSpyContext?: string;
      };

    const messages =
      Array.isArray(
        body.messages
      )
        ? body.messages
        : [];

    const competitorContext =
      typeof body.competitorContext ===
      "string"
        ? body.competitorContext
        : undefined;

    const adSpyContext =
      typeof body.adSpyContext ===
      "string"
        ? body.adSpyContext
        : undefined;

    if (
      messages.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No messages provided",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * --------------------------------------------------
     * 3. Load Brand Vault
     * --------------------------------------------------
     */
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
    const contextValue =
      typeof body.context ===
      "string"
        ? body.context
        : undefined;

    const prompt =
      buildPrompt(
        messages,
        contextValue,
        competitorContext,
        brandVault ??
          undefined,
        adSpyContext
      );

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
        "No current AdSpy intelligence was attached to this ZWIRK request."
      );
    }

    /*
     * --------------------------------------------------
     * 7. Gemini API
     * --------------------------------------------------
     */
    const baseUrl =
      "https://generativelanguage.googleapis.com";

    const callGemini =
      async (
        generationConfig: {
          maxOutputTokens: number;
        }
      ) => {
        let lastResponse:
          | Response
          | null =
          null;

        let lastEndpoint =
          "";

        const maxAttempts =
          3;

        for (
          let attempt = 1;
          attempt <=
          maxAttempts;
          attempt++
        ) {
          const controller =
            new AbortController();

          const timeout =
            setTimeout(
              () =>
                controller.abort(),
              timeoutMs
            );

          try {
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

            const modelName =
              model.replace(
                /^models\//,
                ""
              );

            let endpoint =
              `${baseUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

            let res =
              await fetch(
                endpoint,
                {
                  method:
                    "POST",
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                  body: JSON.stringify(
                    payload
                  ),
                  signal:
                    controller.signal,
                }
              );

            if (
              !res.ok &&
              res.status === 404
            ) {
              endpoint =
                `${baseUrl}/v1/models/${modelName}:generateContent?key=${apiKey}`;

              res =
                await fetch(
                  endpoint,
                  {
                    method:
                      "POST",
                    headers: {
                      "Content-Type":
                        "application/json",
                    },
                    body: JSON.stringify(
                      payload
                    ),
                    signal:
                      controller.signal,
                  }
                );
            }

            lastResponse =
              res;

            lastEndpoint =
              endpoint;

            if (
              res.status ===
              503
            ) {
              if (
                attempt <
                maxAttempts
              ) {
                const delay =
                  attempt *
                  1500;

                console.warn(
                  `[api/zwirk] Gemini 503. Retrying in ${delay}ms...`
                );

                await new Promise(
                  (
                    resolve
                  ) =>
                    setTimeout(
                      resolve,
                      delay
                    )
                );

                continue;
              }
            }

            return {
              res,
              endpoint,
            };
          } catch (error) {
            if (
              attempt ===
              maxAttempts
            ) {
              throw error;
            }

            const delay =
              attempt *
              1500;

            console.warn(
              `[api/zwirk] Gemini request failed. Retrying in ${delay}ms...`
            );

            await new Promise(
              (
                resolve
              ) =>
                setTimeout(
                  resolve,
                  delay
                )
            );
          } finally {
            clearTimeout(
              timeout
            );
          }
        }

        if (
          !lastResponse
        ) {
          throw new Error(
            "Gemini request failed."
          );
        }

        return {
          res:
            lastResponse,
          endpoint:
            lastEndpoint,
        };
      };

    /*
     * --------------------------------------------------
     * 8. Primary Gemini request
     * --------------------------------------------------
     */
    const primaryConfig = {
      maxOutputTokens: 1200,
    };

    const {
      res,
      endpoint,
    } = await callGemini(
      primaryConfig
    );

    /*
     * --------------------------------------------------
     * 9. Handle Gemini error
     * --------------------------------------------------
     */
    if (!res.ok) {
      const errorText =
        await res.text();

      if (
        res.status ===
        503
      ) {
        return NextResponse.json(
          {
            error:
              "Gemini temporarily unavailable",
            status: 503,
            detail:
              "The selected Gemini model is currently experiencing high demand. Please try again in a few seconds.",
            model,
            endpoint,
            retryable:
              true,
          },
          {
            status: 503,
          }
        );
      }

      return NextResponse.json(
        {
          error:
            "LLM error",
          status:
            res.status,
          detail:
            errorText ||
            "No error body returned",
          model,
          endpoint,
        },
        {
          status:
            res.status,
        }
      );
    }

    /*
     * --------------------------------------------------
     * 10. Parse Gemini response
     * --------------------------------------------------
     */
    const data =
      (await res.json()) as GeminiGenerateResponse;

    const result =
      extractReply(data);

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
    const message =
      error instanceof Error
        ? error.message
        : "ZWIRK error";

    return NextResponse.json(
      {
        error:
          message,
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