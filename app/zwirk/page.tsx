"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import type {
  CalculatedReport,
} from "@/lib/types/domain";

import {
  buildCompetitiveNarrative,
} from "@/lib/competitive/signals";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ChatMessage = {
  role:
    | "user"
    | "assistant";
  content: string;
};

const starterPrompts = [
  "Analyze my current marketing performance and tell me the biggest problem.",
  "What should I fix first if CAC is rising 20% MoM?",
  "Give me a 30-day scale plan for Meta and Google.",
  "Summarize the top 3 profit levers for my DTC brand.",
  "Analyze my competitors' Meta ads and tell me what I should test next.",
  "What are competitors doing differently in their creatives, offers and hooks?",
];

type ZwirkContext = {
  label: string;
  summary: string;
};

type ZwirkAdSpyAd = {
  id: string;
  advertiserName?: string | null;
  creatorName?: string | null;
  partnershipType?:
    | "direct"
    | "creator"
    | "unknown";
  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;
  callToAction?: string | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  isActive?: boolean;
  publisherPlatforms?: string[];
  productName?: string | null;
  productPrice?: number | null;
  currency?: string | null;
  offer?: string | null;
  creativeType?:
    | "image"
    | "video"
    | "carousel"
    | "unknown";
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  landingPage?: string | null;
  sourceUrl?: string | null;
  runningDays?: number | null;
  creativeScore?: number | null;
  longevityScore?: number | null;
  relevanceScore?: number | null;
  engagementPotentialScore?:
    | number
    | null;
};

type ZwirkAdSpySnapshot = {
  version: 1;
  source: "AdSpy";
  query: string;
  country: string;
  fetchedAt: string;

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  summary: {
    analyzedAds: number;
    totalAds: number;

    activeAds: number;
    inactiveAds: number;
    activeShare: number;

    videoAds: number;
    imageAds: number;
    carouselAds: number;
    unknownCreativeAds: number;

    videoShare: number;

    creatorAds: number;
    creatorShare: number;

    averageLongevity: number;
    averageCreativeScore: number;
    averageRelevanceScore: number;
    averageEngagementPotential: number;
  };

  creativeFamilies: Array<{
    name: string;
    variants: number;
    imageCount: number;
    videoCount: number;
    carouselCount: number;
    creatorCount: number;
    averageLongevity: number;
    averageCreative: number;
    averageEngagement: number;
    topOffer: string | null;
  }>;

  marketPatterns: {
    topOffers: Array<{
      offer: string;
      count: number;
    }>;
    topCreators: string[];
    hookPatterns: Array<{
      label: string;
      count: number;
      share: number;
    }>;
  };

  recommendedExperiments: string[];

  ads: ZwirkAdSpyAd[];
};

type ProofOfWork = {
  context: string;
  brandVault: string;
  assumptions: string[];
  competitiveContext?: string;
  adSpyContext?: string;
};

type BrandVaultStatus =
  | "loading"
  | "complete"
  | "incomplete";

const ZWIRK_ADSPY_STORAGE_KEY =
  "zwirkAdSpySnapshot";

function formatNumber(
  value?: number | null
): string {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(value)
  ) {
    return "n/a";
  }

  return value.toLocaleString(
    "en-IN"
  );
}

function formatAdSpyForZwirk(
  snapshot: ZwirkAdSpySnapshot
): string {
  const lines: string[] = [];

  lines.push(
    "ADSPY OBSERVED COMPETITOR INTELLIGENCE",
    `Query: ${snapshot.query}`,
    `Country: ${snapshot.country}`,
    `Fetched: ${snapshot.fetchedAt}`,
    `Page: ${snapshot.pagination.page}/${snapshot.pagination.totalPages}`,
    `Visible ads analyzed: ${snapshot.summary.analyzedAds}`,
    `Total matching ads: ${snapshot.summary.totalAds}`,
    ""
  );

  lines.push(
    "SUMMARY:",
    `Active ads: ${snapshot.summary.activeAds} (${snapshot.summary.activeShare}%)`,
    `Inactive ads: ${snapshot.summary.inactiveAds}`,
    `Video ads: ${snapshot.summary.videoAds} (${snapshot.summary.videoShare}%)`,
    `Image ads: ${snapshot.summary.imageAds}`,
    `Carousel ads: ${snapshot.summary.carouselAds}`,
    `Unknown creative ads: ${snapshot.summary.unknownCreativeAds}`,
    `Creator ads: ${snapshot.summary.creatorAds} (${snapshot.summary.creatorShare}%)`,
    `Average longevity: ${snapshot.summary.averageLongevity} days`,
    `Average creative score: ${snapshot.summary.averageCreativeScore}/100`,
    `Average relevance: ${snapshot.summary.averageRelevanceScore}/100`,
    `Average engagement potential: ${snapshot.summary.averageEngagementPotential}/100`,
    ""
  );

  if (
    snapshot.creativeFamilies
      .length > 0
  ) {
    lines.push(
      "CREATIVE FAMILIES:"
    );

    snapshot.creativeFamilies.forEach(
      (family) => {
        lines.push(
          [
            `- ${family.name}`,
            `variants=${family.variants}`,
            `images=${family.imageCount}`,
            `videos=${family.videoCount}`,
            `carousels=${family.carouselCount}`,
            `creators=${family.creatorCount}`,
            `avgLongevity=${family.averageLongevity}d`,
            `avgCreative=${family.averageCreative}/100`,
            `avgEngagementPotential=${family.averageEngagement}/100`,
            `commonOffer=${family.topOffer ?? "n/a"}`,
          ].join(" | ")
        );
      }
    );

    lines.push("");
  }

  if (
    snapshot.marketPatterns
      .topOffers.length > 0
  ) {
    lines.push(
      "COMMON OFFERS:"
    );

    snapshot.marketPatterns.topOffers.forEach(
      (item) => {
        lines.push(
          `- ${item.offer}: ${item.count} ads`
        );
      }
    );

    lines.push("");
  }

  if (
    snapshot.marketPatterns
      .topCreators.length > 0
  ) {
    lines.push(
      "CREATOR SIGNALS:"
    );

    snapshot.marketPatterns.topCreators.forEach(
      (creator) => {
        lines.push(
          `- ${creator}`
        );
      }
    );

    lines.push("");
  }

  if (
    snapshot.marketPatterns
      .hookPatterns.length > 0
  ) {
    lines.push(
      "HOOK PATTERNS:"
    );

    snapshot.marketPatterns.hookPatterns.forEach(
      (pattern) => {
        lines.push(
          `- ${pattern.label}: ${pattern.share}% (${pattern.count} ads)`
        );
      }
    );

    lines.push("");
  }

  if (
    snapshot.recommendedExperiments
      .length > 0
  ) {
    lines.push(
      "ADSPY-BASED TEST IDEAS:"
    );

    snapshot.recommendedExperiments.forEach(
      (experiment) => {
        lines.push(
          `- ${experiment}`
        );
      }
    );

    lines.push("");
  }

  lines.push(
    "VISIBLE AD DETAILS:"
  );

  snapshot.ads.forEach(
    (ad, index) => {
      lines.push(
        `--- AD ${index + 1} ---`,
        `ID: ${ad.id}`,
        `Advertiser: ${ad.advertiserName ?? "n/a"}`,
        `Creator: ${ad.creatorName ?? "n/a"}`,
        `Partnership: ${ad.partnershipType ?? "n/a"}`,
        `Product: ${ad.productName ?? "n/a"}`,
        `Offer: ${ad.offer ?? "n/a"}`,
        `Creative type: ${ad.creativeType ?? "n/a"}`,
        `CTA: ${ad.callToAction ?? "n/a"}`,
        `Active: ${
          typeof ad.isActive ===
          "boolean"
            ? String(
                ad.isActive
              )
            : "n/a"
        }`,
        `Running days: ${
          ad.runningDays ??
          "n/a"
        }`,
        `First seen: ${
          ad.firstSeen ??
          "n/a"
        }`,
        `Last seen: ${
          ad.lastSeen ??
          "n/a"
        }`,
        `Creative score: ${
          ad.creativeScore ??
          "n/a"
        }/100`,
        `Longevity score: ${
          ad.longevityScore ??
          "n/a"
        }/100`,
        `Relevance score: ${
          ad.relevanceScore ??
          "n/a"
        }/100`,
        `Engagement potential: ${
          ad.engagementPotentialScore ??
          "n/a"
        }/100`,
        `Platforms: ${
          ad.publisherPlatforms?.join(
            ", "
          ) || "n/a"
        }`,
        `Headline: ${
          ad.headline ??
          "n/a"
        }`,
        `Primary text: ${
          ad.primaryText ??
          "n/a"
        }`,
        `Description: ${
          ad.description ??
          "n/a"
        }`,
        ""
      );
    }
  );

  lines.push(
    "IMPORTANT: AdSpy scores are estimates or derived signals. They are not actual competitor clicks, CTR, impressions, spend, conversions, revenue, ROAS or profit."
  );

  return lines.join(
    "\n"
  );
}

export default function ZwirkPage() {
  const [messages, setMessages] =
    useState<ChatMessage[]>(
      [
        {
          role: "assistant",
          content:
            "I'm ZWIRK. Ask me about your marketing performance, profitability, CAC, ROAS, scaling strategy, or what your competitors are doing in the Meta Ad Library.",
        },
      ]
    );

  const [input, setInput] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(
      null
    );

  const [context, setContext] =
    useState<ZwirkContext | null>(
      null
    );

  const [
    competitorSignals,
    setCompetitorSignals,
  ] = useState<string[]>(
    []
  );

  const [adSpySnapshot, setAdSpySnapshot] =
    useState<ZwirkAdSpySnapshot | null>(
      null
    );

  const [adSpyContext, setAdSpyContext] =
    useState("");

  const [proof, setProof] =
    useState<ProofOfWork | null>(
      null
    );

  const [brandVaultStatus] =
    useState<BrandVaultStatus>(
      "loading"
    );

  const [useContext, setUseContext] =
    useState(true);

  const [
    useAdSpyContext,
    setUseAdSpyContext,
  ] = useState(true);

  const [actionToasts, setActionToasts] =
    useState<
      Record<string, string>
    >({});

  const canSend =
    input.trim().length > 0 &&
    !loading;

  const chatBody = useMemo(
    () =>
      messages.filter(
        (msg) =>
          msg.content
            .trim()
            .length > 0
      ),
    [messages]
  );

  /*
   * --------------------------------------------------
   * Load saved chat
   * --------------------------------------------------
   */
  useEffect(() => {
    const saved =
      localStorage.getItem(
        "zwirkChat"
      );

    if (!saved) {
      return;
    }

    try {
      const parsed =
        JSON.parse(
          saved
        ) as ChatMessage[];

      if (
        Array.isArray(
          parsed
        ) &&
        parsed.length > 0
      ) {
        setMessages(
          parsed
        );
      }
    } catch {
      // Ignore invalid saved chat.
    }
  }, []);

  /*
   * --------------------------------------------------
   * Save chat
   * --------------------------------------------------
   */
  useEffect(() => {
    localStorage.setItem(
      "zwirkChat",
      JSON.stringify(
        messages
      )
    );
  }, [messages]);

  /*
   * --------------------------------------------------
   * Load dashboard + AdSpy context
   * --------------------------------------------------
   */
  useEffect(() => {
    const storedReport =
      sessionStorage.getItem(
        "report"
      );

    if (storedReport) {
      try {
        const report =
          JSON.parse(
            storedReport
          ) as CalculatedReport;

        const summaryLines = [
          `Contribution margin: ${pct(
            report.unitEconomics
              .contributionMarginPct
          )}`,

          `Blended ROAS: ${fmt(
            report.adMetrics
              .blendedRoas
          )}x`,

          `Blended CAC: ${fmt(
            report.adMetrics
              .blendedCac
          )}`,

          `Max allowable CAC: ${fmt(
            report.unitEconomics
              .maxAllowableCac
          )}`,

          `Net profit margin: ${pct(
            report.monthlyPnl
              .netProfitMarginPct
          )}`,

          `Net revenue (month): ${fmt(
            report.monthlyPnl
              .netRevenueMonth
          )}`,

          `Net profit (month): ${fmt(
            report.monthlyPnl
              .netProfitMonth
          )}`,

          `Scale verdict: ${
            report.scalePlanner
              .readiness
          }`,
        ];

        const competitorNarrative =
          buildCompetitiveNarrative(
            report
          );

        const summary =
          competitorNarrative.length >
          0
            ? [
                ...summaryLines,
                "",
                "Competitive radar:",
                ...competitorNarrative,
              ].join("\n")
            : summaryLines.join(
                "\n"
              );

        setContext({
          label:
            "Dashboard context loaded",
          summary,
        });

        setCompetitorSignals(
          competitorNarrative
        );
      } catch {
        // Ignore malformed dashboard data.
      }
    }

    try {
      const rawAdSpy =
        sessionStorage.getItem(
          ZWIRK_ADSPY_STORAGE_KEY
        );

      if (!rawAdSpy) {
        return;
      }

      const parsed =
        JSON.parse(
          rawAdSpy
        ) as ZwirkAdSpySnapshot;

      if (
        !parsed ||
        parsed.version !== 1 ||
        parsed.source !==
          "AdSpy" ||
        !Array.isArray(
          parsed.ads
        )
      ) {
        return;
      }

      setAdSpySnapshot(
        parsed
      );

      setAdSpyContext(
        formatAdSpyForZwirk(
          parsed
        )
      );
    } catch {
      // Ignore malformed AdSpy state.
    }
  }, []);

  /*
   * --------------------------------------------------
   * Formatting helpers
   * --------------------------------------------------
   */
  function fmt(
    value?: number,
    suffix = ""
  ) {
    if (
      typeof value !==
        "number" ||
      Number.isNaN(value)
    ) {
      return "n/a";
    }

    return `${value.toLocaleString(
      "en-IN",
      {
        maximumFractionDigits: 2,
      }
    )}${suffix}`;
  }

  function pct(
    value?: number
  ) {
    if (
      typeof value !==
        "number" ||
      Number.isNaN(value)
    ) {
      return "n/a";
    }

    return `${(
      value * 100
    ).toFixed(1)}%`;
  }

  /*
   * --------------------------------------------------
   * Reset chat
   * --------------------------------------------------
   */
  function resetChat() {
    const initial: ChatMessage[] =
      [
        {
          role: "assistant",
          content:
            "I'm ZWIRK. Ask me about your marketing performance, profitability, CAC, ROAS, scaling strategy, or what your competitors are doing in the Meta Ad Library.",
        },
      ];

    setMessages(
      initial
    );

    setError(null);
    setProof(null);

    localStorage.removeItem(
      "zwirkChat"
    );
  }

  /*
   * --------------------------------------------------
   * Copy
   * --------------------------------------------------
   */
  async function copyMessage(
    text: string
  ) {
    try {
      await navigator.clipboard.writeText(
        text
      );
    } catch {
      // Ignore clipboard errors.
    }
  }

  /*
   * --------------------------------------------------
   * Action toast
   * --------------------------------------------------
   */
  function showActionToast(
    key: string,
    label: string
  ) {
    setActionToasts(
      (prev) => ({
        ...prev,
        [key]: label,
      })
    );

    window.setTimeout(
      () => {
        setActionToasts(
          (prev) => {
            const next = {
              ...prev,
            };

            delete next[key];

            return next;
          }
        );
      },
      1400
    );
  }

  /*
   * --------------------------------------------------
   * Download response
   * --------------------------------------------------
   */
  function downloadMessage(
    text: string
  ) {
    const blob =
      new Blob(
        [text],
        {
          type: "text/plain",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.download =
      `zwirk-response-${new Date()
        .toISOString()
        .slice(
          0,
          10
        )}.txt`;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
      url
    );
  }

  /*
   * --------------------------------------------------
   * Retry
   * --------------------------------------------------
   */
  function retryLastPrompt() {
    const lastUser =
      [
        ...messages,
      ]
        .reverse()
        .find(
          (msg) =>
            msg.role ===
            "user"
        );

    if (!lastUser) {
      return;
    }

    void sendMessage(
      lastUser.content
    );
  }

  /*
   * --------------------------------------------------
   * Tooltip
   * --------------------------------------------------
   */
  function tooltipFor(
    index: number,
    action: string,
    label: string
  ) {
    return (
      actionToasts[
        `${index}:${action}`
      ] ?? label
    );
  }

  /*
   * --------------------------------------------------
   * Send message
   * --------------------------------------------------
   */
  async function sendMessage(
    message: string
  ) {
    const trimmedMessage =
      message.trim();

    if (
      !trimmedMessage ||
      loading
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    setProof(null);

    const nextMessages: ChatMessage[] =
      [
        ...messages,
        {
          role: "user",
          content:
            trimmedMessage,
        },
      ];

    setMessages(
      nextMessages
    );

    setInput("");

    try {
      const payload: {
        messages: ChatMessage[];
        context?: string;
        competitorContext?: string;
        adSpyContext?: string;
      } = {
        messages:
          nextMessages,
      };

      if (
        useContext &&
        context?.summary
      ) {
        payload.context =
          context.summary;
      }

      if (
        competitorSignals.length >
        0
      ) {
        payload.competitorContext =
          competitorSignals.join(
            "\n"
          );
      }

      if (
        useAdSpyContext &&
        adSpyContext
      ) {
        payload.adSpyContext =
          adSpyContext;
      }

      const res =
        await fetch(
          "/api/zwirk",
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
          }
        );

      const data =
        await res
          .json()
          .catch(
            () => ({})
          );

      if (!res.ok) {
        throw new Error(
          data?.detail ||
            data?.error ||
            "Unable to reach ZWIRK."
        );
      }

      const responseData =
        data as {
          reply?: string;
          proof?:
            | ProofOfWork
            | null;
        };

      const reply =
        responseData.reply ||
        "I could not generate a response.";

      setProof(
        responseData.proof ??
          null
      );

      setMessages(
        (prev) => [
          ...prev,
          {
            role:
              "assistant",
            content:
              reply,
          },
        ]
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "ZWIRK is unavailable right now."
      );

      setProof(
        null
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="main zwirk-page">
      <header className="zwirk-hero">
        <div>
          <p className="eyebrow">
            ZWIRK Profit Diagnostic
          </p>

          <h1>
            <span>
              ZWIRK
            </span>

            <span className="zwirk-title-beta">
              BETA version
            </span>

            -- a quick profit
            check for D2C
            teams
          </h1>

          <p className="muted-text">
            Ask focused profit
            and scale questions,
            then get clear,
            actionable next
            steps using your
            business data and
            current competitor
            intelligence.
          </p>

          <div className="zwirk-hero-actions">
            <Link href="/dashboard">
              <Button
                type="button"
                variant="secondary"
              >
                Back to Dashboard
              </Button>
            </Link>

            <Link href="/">
              <Button
                type="button"
                variant="secondary"
              >
                Home
              </Button>
            </Link>

            <Button
              type="button"
              variant="secondary"
              onClick={
                resetChat
              }
            >
              Clear Chat
            </Button>
          </div>

          {context ? (
            <label className="zwirk-context-toggle">
              <input
                type="checkbox"
                checked={
                  useContext
                }
                onChange={(
                  event
                ) =>
                  setUseContext(
                    event.target
                      .checked
                  )
                }
              />

              <span>
                {
                  context.label
                }
              </span>
            </label>
          ) : (
            <p className="muted-text zwirk-context-note">
              Connect your dashboard
              to unlock
              context-aware answers.
            </p>
          )}

          {adSpySnapshot ? (
            <label className="zwirk-context-toggle">
              <input
                type="checkbox"
                checked={
                  useAdSpyContext
                }
                onChange={(
                  event
                ) =>
                  setUseAdSpyContext(
                    event.target
                      .checked
                  )
                }
              />

              <span>
                AdSpy intelligence
                loaded:{" "}
                {
                  adSpySnapshot
                    .summary
                    .totalAds
                }{" "}
                ads from{" "}
                {
                  adSpySnapshot.query
                }
              </span>
            </label>
          ) : (
            <p className="muted-text zwirk-context-note">
              Run an AdSpy search
              from the Dashboard to
              give ZWIRK current
              competitor intelligence.
            </p>
          )}

          {competitorSignals.length >
          0 ? (
            <div className="zwirk-competitive-summary">
              <h4>
                Competitor radar
              </h4>

              <ul>
                {competitorSignals.map(
                  (signal) => (
                    <li
                      key={
                        signal
                      }
                    >
                      {
                        signal
                      }
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : null}

          {adSpySnapshot ? (
            <div className="zwirk-competitive-summary">
              <h4>
                AdSpy snapshot
              </h4>

              <ul>
                <li>
                  {
                    adSpySnapshot
                      .summary
                      .totalAds
                  }{" "}
                  total matching
                  competitor ads
                </li>

                <li>
                  {
                    adSpySnapshot
                      .summary
                      .videoShare
                  }
                  % video share
                </li>

                <li>
                  {
                    adSpySnapshot
                      .summary
                      .creatorShare
                  }
                  % creator share
                </li>

                <li>
                  Average
                  observed
                  longevity:{" "}
                  {
                    adSpySnapshot
                      .summary
                      .averageLongevity
                  }{" "}
                  days
                </li>
              </ul>
            </div>
          ) : null}

          {brandVaultStatus !==
          "complete" ? (
            <div className="zwirk-vault-cta">
              <p className="muted-text">
                Complete your Brand
                Vault to make ZWIRK
                sound like your
                brand.
              </p>

              <Link href="/brand-vault">
                <Button
                  type="button"
                  variant="secondary"
                >
                  Complete Brand Vault
                </Button>
              </Link>
            </div>
          ) : null}
        </div>

        <Card className="zwirk-hero-card">
          <CardHeader>
            <CardTitle>
              Starter prompts
            </CardTitle>

            <CardDescription>
              Pick one to launch a
              fast diagnostic.
            </CardDescription>
          </CardHeader>

          <CardContent className="zwirk-prompt-grid">
            {starterPrompts.map(
              (prompt) => (
                <button
                  key={
                    prompt
                  }
                  type="button"
                  className="zwirk-prompt"
                  onClick={() =>
                    void sendMessage(
                      prompt
                    )
                  }
                  disabled={
                    loading
                  }
                >
                  {
                    prompt
                  }
                </button>
              )
            )}
          </CardContent>
        </Card>

        <Card className="zwirk-hero-card zwirk-capabilities">
          <CardHeader>
            <CardTitle>
              What ZWIRK does best
            </CardTitle>

            <CardDescription>
              Fast, tactical
              answers in plain
              English.
            </CardDescription>
          </CardHeader>

          <CardContent className="zwirk-capability-list">
            <div>
              <h4>
                Profit
                diagnostics
              </h4>

              <p className="muted-text">
                Identify margin,
                CAC, and ROAS
                bottlenecks quickly.
              </p>
            </div>

            <div>
              <h4>
                Scale guidance
              </h4>

              <p className="muted-text">
                Turn numbers into
                scale / hold / fix
                decisions.
              </p>
            </div>

            <div>
              <h4>
                Competitive
                intelligence
              </h4>

              <p className="muted-text">
                Connect current
                competitor creatives,
                offers, creators,
                hooks and longevity
                signals to your
                own business
                decisions.
              </p>
            </div>
          </CardContent>
        </Card>
      </header>

      <section className="zwirk-chat surface">
        <div className="zwirk-chat-header">
          <h2>
            Conversation
          </h2>

          <span
            className="proof-badge"
            style={{
              backgroundColor:
                proof
                  ? proof.assumptions
                      .length > 0
                    ? "#e7f8ec"
                    : "#fdf2d6"
                  : "#f4f4f4",

              color:
                proof
                  ? proof.assumptions
                      .length > 0
                    ? "#0f6b30"
                    : "#805500"
                  : "#666",

              borderRadius: 999,
              padding:
                "2px 10px",
              fontSize: 12,
              marginLeft: 12,
            }}
          >
            {proof
              ? proof.assumptions
                  .length > 0
                ? "Proof attached"
                : "Proof pending"
              : "Proof pending"}
          </span>

          <span
            className={`status-dot ${
              loading
                ? "status-warn"
                : "status-good"
            }`}
          >
            {loading
              ? "ZWIRK is thinking..."
              : "Ready"}
          </span>
        </div>

        <div className="zwirk-messages">
          {chatBody.map(
            (
              msg,
              index
            ) => (
              <div
                key={`${msg.role}-${index}`}
                className={`zwirk-message-group ${msg.role}`}
              >
                <div
                  className={`zwirk-message ${msg.role}`}
                >
                  <span>
                    {
                      msg.content
                    }
                  </span>
                </div>

                {msg.role ===
                "assistant" ? (
                  <div className="zwirk-actions">
                    <button
                      type="button"
                      className="zwirk-action"
                      onClick={() => {
                        void copyMessage(
                          msg.content
                        );

                        showActionToast(
                          `${index}:copy`,
                          "Copied"
                        );
                      }}
                      data-tooltip={tooltipFor(
                        index,
                        "copy",
                        "Copy"
                      )}
                      aria-label="Copy response"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        fill="none"
                      >
                        <rect
                          x="9"
                          y="9"
                          width="10"
                          height="10"
                          rx="2"
                        />
                        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="zwirk-action"
                      onClick={() =>
                        showActionToast(
                          `${index}:like`,
                          "Liked"
                        )
                      }
                      data-tooltip={tooltipFor(
                        index,
                        "like",
                        "Like"
                      )}
                      aria-label="Like response"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        fill="none"
                      >
                        <path d="M7 11V5a2 2 0 0 1 2-2h0l3 6h5a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-5l-3 6h0a2 2 0 0 1-2-2v-6z" />
                        <path d="M5 11h2v9H5z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="zwirk-action"
                      onClick={() =>
                        showActionToast(
                          `${index}:dislike`,
                          "Disliked"
                        )
                      }
                      data-tooltip={tooltipFor(
                        index,
                        "dislike",
                        "Dislike"
                      )}
                      aria-label="Dislike response"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        fill="none"
                      >
                        <path d="M7 13v6a2 2 0 0 0 2 2h0l3-6h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5L9 3h0a2 2 0 0 0-2 2v6z" />
                        <path d="M5 4h2v9H5z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="zwirk-action"
                      onClick={() => {
                        downloadMessage(
                          msg.content
                        );

                        showActionToast(
                          `${index}:download`,
                          "Downloaded"
                        );
                      }}
                      data-tooltip={tooltipFor(
                        index,
                        "download",
                        "Download"
                      )}
                      aria-label="Download response"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        fill="none"
                      >
                        <path d="M12 3v10" />
                        <path d="M8 9l4 4 4-4" />
                        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="zwirk-action"
                      onClick={() => {
                        retryLastPrompt();

                        showActionToast(
                          `${index}:retry`,
                          "Retrying"
                        );
                      }}
                      data-tooltip={tooltipFor(
                        index,
                        "retry",
                        "Retry"
                      )}
                      aria-label="Retry response"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        fill="none"
                      >
                        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                        <path d="M20 4v6h-6" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
            )
          )}

          {loading ? (
            <div className="zwirk-message assistant zwirk-typing">
              <span className="zwirk-dot" />
              <span className="zwirk-dot" />
              <span className="zwirk-dot" />
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="error-text">
            {
              error
            }
          </p>
        ) : null}

        {proof ? (
          <div className="zwirk-proof">
            <details>
              <summary>
                Why this plan?
              </summary>

              <div className="zwirk-proof-body">
                <div>
                  <h4>
                    Inputs Used
                  </h4>

                  <pre>
                    {
                      proof.context
                    }
                  </pre>
                </div>

                <div>
                  <h4>
                    Brand Rules Applied
                  </h4>

                  <pre>
                    {
                      proof.brandVault
                    }
                  </pre>
                </div>

                {proof.competitiveContext ? (
                  <div>
                    <h4>
                      Competitive radar
                    </h4>

                    <pre>
                      {
                        proof.competitiveContext
                      }
                    </pre>
                  </div>
                ) : null}

                {proof.adSpyContext ? (
                  <div>
                    <h4>
                      AdSpy intelligence
                      used
                    </h4>

                    <pre>
                      {
                        proof.adSpyContext
                      }
                    </pre>
                  </div>
                ) : null}

                {proof.assumptions.length >
                0 ? (
                  <div>
                    <h4>
                      Assumptions
                    </h4>

                    <ul>
                      {proof.assumptions.map(
                        (
                          item
                        ) => (
                          <li
                            key={
                              item
                            }
                          >
                            {
                              item
                            }
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                ) : (
                  <div>
                    <h4>
                      Assumptions
                    </h4>

                    <p className="muted-text">
                      No assumptions
                      detected.
                    </p>
                  </div>
                )}
              </div>
            </details>
          </div>
        ) : null}

        <div className="zwirk-input">
          <Textarea
            value={input}
            onChange={(
              event
            ) =>
              setInput(
                event.target
                  .value
              )
            }
            onKeyDown={(
              event
            ) => {
              if (
                event.key ===
                  "Enter" &&
                !event.shiftKey
              ) {
                event.preventDefault();

                if (canSend) {
                  void sendMessage(
                    input
                  );
                }
              }
            }}
            placeholder="Type your question for ZWIRK..."
            rows={3}
          />

          <Button
            type="button"
            onClick={() =>
              void sendMessage(
                input
              )
            }
            disabled={
              !canSend
            }
          >
            {loading
              ? "Sending..."
              : "Send to ZWIRK"}
          </Button>
        </div>
      </section>
    </main>
  );
}