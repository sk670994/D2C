"use client";

import { useEffect, useMemo, useState } from "react";

type AdSpyLoadingExperienceProps = {
  platform:
    | "meta"
    | "google"
    | "linkedin";
};

type LoadingStage = {
  label: string;
  icon: string;
};

type LoadingMessage = {
  icon: string;
  label: string;
  text: string;
};

const STAGES: LoadingStage[] = [
  {
    icon: "◌",
    label: "Connecting to ad library",
  },
  {
    icon: "◌",
    label: "Discovering competitor creatives",
  },
  {
    icon: "◌",
    label: "Cleaning and validating data",
  },
  {
    icon: "◌",
    label: "Comparing creative patterns",
  },
  {
    icon: "◌",
    label: "Building competitive intelligence",
  },
];

const MESSAGES: LoadingMessage[] = [
  {
    icon: "💡",
    label: "Intelligence note",
    text:
      "We're looking for patterns that repeat across creative variations, not just individual ads.",
  },
  {
    icon: "🧠",
    label: "Marketing insight",
    text:
      "A creative that survives longer can reveal more durable positioning than a brand-new launch.",
  },
  {
    icon: "🔎",
    label: "What we're checking",
    text:
      "Offers, hooks, product messages, formats, longevity and repeated creative concepts.",
  },
  {
    icon: "🌍",
    label: "Competitive intelligence",
    text:
      "The same product can be marketed through very different angles. We're comparing the angles, not just the products.",
  },
  {
    icon: "😄",
    label: "Meanwhile...",
    text:
      "Your competitor launched another variation. Apparently one ad was never enough.",
  },
  {
    icon: "😄",
    label: "Meanwhile...",
    text:
      "Somewhere, another marketer is changing the button colour for the seventh time.",
  },
  {
    icon: "📊",
    label: "Analysis note",
    text:
      "Repeated messages across multiple creatives are often more interesting than a single clever headline.",
  },
  {
    icon: "⚡",
    label: "Performance note",
    text:
      "Fresh searches can take longer because the public ad library has to be scanned and normalized first.",
  },
];

function getPlatformName(
  platform:
    | "meta"
    | "google"
    | "linkedin"
): string {
  if (platform === "google") {
    return "Google Ads Transparency Center";
  }

  if (platform === "linkedin") {
    return "LinkedIn Ad Library";
  }

  return "Meta Ad Library";
}

export default function AdSpyLoadingExperience({
  platform,
}: AdSpyLoadingExperienceProps) {
  const [
    activeStage,
    setActiveStage,
  ] = useState(0);

  const [
    messageIndex,
    setMessageIndex,
  ] = useState(0);

  const platformName =
    useMemo(
      () => getPlatformName(platform),
      [platform]
    );

  useEffect(() => {
    setActiveStage(0);
    setMessageIndex(0);

    const stageTimer =
      window.setInterval(() => {
        setActiveStage(
          (current) =>
            Math.min(
              current + 1,
              STAGES.length - 1
            )
        );
      }, 3200);

    const messageTimer =
      window.setInterval(() => {
        setMessageIndex(
          (current) =>
            (current + 1) %
            MESSAGES.length
        );
      }, 3800);

    return () => {
      window.clearInterval(
        stageTimer
      );

      window.clearInterval(
        messageTimer
      );
    };
  }, [platform]);

  const currentMessage =
    MESSAGES[messageIndex];

  return (
    <div
      className="surface"
      style={{
        padding: 22,
        borderRadius: 16,
        marginBottom: 20,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent:
            "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            flex: "1 1 420px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                display: "grid",
                placeItems: "center",
                background:
                  "var(--muted, rgba(127,127,127,0.12))",
                fontSize: 19,
                animation:
                  "adspyPulse 1.8s ease-in-out infinite",
              }}
            >
              🔎
            </div>

            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "1rem",
                }}
              >
                Searching{" "}
                {platformName}
              </div>

              <div
                className="muted-text"
                style={{
                  marginTop: 3,
                  fontSize:
                    "0.86rem",
                }}
              >
                Turning raw public
                creatives into
                competitive
                intelligence.
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gap: 8,
            }}
          >
            {STAGES.map(
              (
                stage,
                index
              ) => {
                const completed =
                  index <
                  activeStage;

                const active =
                  index ===
                  activeStage;

                return (
                  <div
                    key={
                      stage.label
                    }
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap: 10,
                      opacity:
                        index <=
                        activeStage
                          ? 1
                          : 0.45,
                      transition:
                        "opacity 250ms ease",
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius:
                          999,
                        display:
                          "grid",
                        placeItems:
                          "center",
                        fontSize:
                          "0.78rem",
                        background:
                          completed
                            ? "rgba(34,197,94,0.14)"
                            : active
                            ? "rgba(59,130,246,0.14)"
                            : "var(--muted, rgba(127,127,127,0.08))",
                      }}
                    >
                      {completed
                        ? "✓"
                        : active
                        ? "•"
                        : stage.icon}
                    </div>

                    <div
                      style={{
                        fontSize:
                          "0.88rem",
                        fontWeight:
                          active
                            ? 600
                            : 500,
                      }}
                    >
                      {
                        stage.label
                      }
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>

        <div
          style={{
            flex:
              "1 1 300px",
            maxWidth: 420,
            minWidth: 0,
          }}
        >
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background:
                "var(--muted, rgba(127,127,127,0.07))",
              minHeight: 138,
              display: "flex",
              flexDirection:
                "column",
              justifyContent:
                "center",
              transition:
                "all 300ms ease",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: 8,
                fontWeight: 700,
                fontSize:
                  "0.88rem",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontSize:
                    "1.1rem",
                }}
              >
                {
                  currentMessage.icon
                }
              </span>

              {
                currentMessage.label
              }
            </div>

            <p
              className="muted-text"
              style={{
                margin:
                  "8px 0 0",
                lineHeight:
                  1.55,
                fontSize:
                  "0.88rem",
              }}
            >
              {
                currentMessage.text
              }
            </p>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent:
                "center",
              gap: 5,
              marginTop: 12,
            }}
            aria-hidden="true"
          >
            {MESSAGES.slice(
              0,
              5
            ).map(
              (_, index) => (
                <span
                  key={index}
                  style={{
                    width:
                      index ===
                      messageIndex %
                        5
                        ? 18
                        : 6,
                    height: 6,
                    borderRadius:
                      999,
                    background:
                      "currentColor",
                    opacity:
                      index ===
                      messageIndex %
                        5
                        ? 0.7
                        : 0.18,
                    transition:
                      "all 250ms ease",
                  }}
                />
              )
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes adspyPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.82;
          }

          50% {
            transform: scale(1.08);
            opacity: 1;
          }
        }

        @media (max-width: 700px) {
          .adspy-loading {
            padding: 16px;
          }
        }
      `}</style>
    </div>
  );
}