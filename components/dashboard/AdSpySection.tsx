"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AdSpyAd = {
  id: string;
  advertiserName?: string | null;
  creatorName?: string | null;
  partnershipType?: "direct" | "creator" | "unknown";
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
  creativeType?: "image" | "video" | "carousel" | "unknown";
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  landingPage?: string | null;
  sourceUrl?: string | null;
  runningDays?: number | null;
  creativeScore?: number | null;
  longevityScore?: number | null;
  relevanceScore?: number | null;
  engagementPotentialScore?: number | null;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: number | null;
  previousPage: number | null;
};

type AdSpyResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  ads?: AdSpyAd[];
  count?: number;
  pagination?: Pagination;
};

export type AdSpySectionProps = {
  query: string;
  country: string;
  onQueryChange: (query: string) => void;
  onCountryChange: (country: string) => void;
  onResultCountChange?: (count: number) => void;
};

function firstUrl(value?: string | null): string | null {
  if (!value) return null;

  const text = value.trim();
  if (!text) return null;

  try {
    return new URL(text).toString();
  } catch {
    return null;
  }
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function scoreLabel(score?: number | null): string {
  const value = Number(score);

  if (!Number.isFinite(value)) {
    return "—";
  }

  return String(Math.round(value));
}

function scoreTone(
  score?: number | null
): "success" | "warning" | "secondary" {
  const value = Number(score ?? 0);

  if (value >= 80) {
    return "success";
  }

  if (value >= 60) {
    return "warning";
  }

  return "secondary";
}

function openExternalUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function AdSpySection({
  query,
  country,
  onQueryChange,
  onCountryChange,
  onResultCountChange,
}: AdSpySectionProps) {
  const [page, setPage] = useState(1);
  const limit = 20;

  const [ads, setAds] = useState<AdSpyAd[]>([]);
  const [pagination, setPagination] =
    useState<Pagination | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(pageToLoad = 1) {
    const trimmedQuery = query.trim();
    const normalizedCountry =
      country.trim().toUpperCase() || "IN";

    if (!trimmedQuery) {
      setError("Enter a brand or keyword.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        q: trimmedQuery,
        country: normalizedCountry,
        page: String(pageToLoad),
        limit: String(limit),
        platform: "meta",
        mode: "advertiser",
      });

      const response = await fetch(
        `/api/ad-intelligence/search?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = (await response.json()) as AdSpyResponse;

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message ||
            data.error ||
            "AdSpy search failed."
        );
      }

      const nextAds = Array.isArray(data.ads)
        ? data.ads
        : [];

      setAds(nextAds);
      setPagination(data.pagination);

      const resolvedPage =
        data.pagination?.page ?? pageToLoad;

      setPage(resolvedPage);

      onResultCountChange?.(
        data.pagination?.total ??
          data.count ??
          nextAds.length
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to search AdSpy.";

      setAds([]);
      setPagination(undefined);
      setPage(1);
      setError(message);

      onResultCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    onQueryChange("");
    setAds([]);
    setPagination(undefined);
    setPage(1);
    setError("");
    onResultCountChange?.(0);
  }

  function goToPage(nextPage: number) {
    if (nextPage < 1) {
      return;
    }

    if (
      pagination &&
      nextPage > pagination.totalPages
    ) {
      return;
    }

    void search(nextPage);
  }

  const totalResults =
    pagination?.total ?? ads.length;

  const showingStart =
    pagination && pagination.total > 0
      ? (pagination.page - 1) *
          pagination.limit +
        1
      : 0;

  const showingEnd = pagination
    ? Math.min(
        pagination.page * pagination.limit,
        pagination.total
      )
    : ads.length;

  return (
    <section className="adspy-section">
      <div
        className="section-head"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ margin: 0 }}>AdSpy</h3>

            <Badge variant="secondary">
              {pagination
                ? `${totalResults.toLocaleString("en-IN")} ads found`
                : "Meta Ad Library"}
            </Badge>
          </div>

          <p
            className="muted-text"
            style={{
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            Search competitor creatives from Meta
            Ad Library with scoring and pagination.
          </p>
        </div>
      </div>

      <div
        className="surface"
        style={{
          padding: 16,
          borderRadius: 14,
          marginBottom: 20,
        }}
      >
        <div
          className="editor-grid"
          style={{
            alignItems: "end",
          }}
        >
          <Label className="input-row">
            <span>Brand or keyword</span>

            <Input
              type="text"
              placeholder="e.g. Mamaearth, Nike, skincare"
              value={query}
              onChange={(event) =>
                onQueryChange(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void search(1);
                }
              }}
            />
          </Label>

          <Label className="input-row">
            <span>Country</span>

            <Input
              type="text"
              value={country}
              maxLength={2}
              placeholder="IN"
              onChange={(event) =>
                onCountryChange(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, "")
                    .slice(0, 2)
                )
              }
            />
          </Label>

          <div
            className="action-row"
            style={{
              alignItems: "end",
            }}
          >
            <Button
              type="button"
              onClick={() => void search(1)}
              disabled={loading}
            >
              {loading
                ? "Searching..."
                : "Search AdSpy"}
            </Button>

            {(query || ads.length > 0) &&
            !loading ? (
              <Button
                type="button"
                variant="secondary"
                onClick={clearSearch}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {pagination ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 14,
            }}
          >
            <Badge variant="secondary">
              {totalResults.toLocaleString("en-IN")} total
            </Badge>

            <Badge variant="secondary">
              Page {pagination.page} /{" "}
              {pagination.totalPages}
            </Badge>

            <Badge variant="secondary">
              {country || "IN"}
            </Badge>
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          className="surface"
          style={{
            padding: 14,
            borderRadius: 12,
            marginBottom: 18,
          }}
        >
          <p
            className="error-text"
            style={{ margin: 0 }}
          >
            {error}
          </p>
        </div>
      ) : null}

      {loading ? (
        <div
          className="surface"
          style={{
            padding: 28,
            borderRadius: 14,
            textAlign: "center",
            marginBottom: 20,
          }}
        >
          <p
            style={{
              margin: 0,
              fontWeight: 600,
            }}
          >
            Searching Meta Ad Library...
          </p>

          <p
            className="muted-text"
            style={{
              margin: "7px 0 0",
            }}
          >
            Loading, scoring and ranking competitor
            creatives.
          </p>
        </div>
      ) : null}

      {!loading &&
      ads.length === 0 &&
      !error ? (
        <div
          className="surface"
          style={{
            padding: 34,
            borderRadius: 14,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              margin: "0 auto 14px",
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              background:
                "var(--muted, rgba(127,127,127,0.12))",
              fontSize: 24,
            }}
          >
            🔎
          </div>

          <h4 style={{ margin: 0 }}>
            Search competitor ads
          </h4>

          <p
            className="muted-text"
            style={{
              margin: "7px auto 0",
              maxWidth: 520,
            }}
          >
            Enter a brand or keyword to discover
            public Meta creatives, offers, formats
            and longevity signals.
          </p>
        </div>
      ) : null}

      {ads.length > 0 ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h4 style={{ margin: 0 }}>
                Competitor creatives
              </h4>

              <p
                className="muted-text"
                style={{
                  margin: "4px 0 0",
                }}
              >
                Ranked by creative quality,
                longevity, relevance and
                engagement.
              </p>
            </div>

            {pagination ? (
              <Badge variant="secondary">
                Showing {showingStart}–{showingEnd}
              </Badge>
            ) : null}
          </div>

          <div
            className="fix-grid"
            style={{
              marginTop: 0,
              gap: 18,
            }}
          >
            {ads.map((ad, index) => {
              const image =
                firstUrl(ad.imageUrl) ??
                firstUrl(ad.thumbnailUrl);

              const landingPage =
                firstUrl(ad.landingPage);

              const sourceUrl =
                firstUrl(ad.sourceUrl);

              const videoUrl =
                firstUrl(ad.videoUrl);

              const title =
                ad.headline ||
                ad.productName ||
                "Untitled ad";

              const advertiser =
                ad.advertiserName ||
                "Unknown advertiser";

              return (
                <article
                  key={`${ad.id}-${index}`}
                  className="fix-card"
                  style={{
                    padding: 0,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {image ? (
                    <div
                      style={{
                        position: "relative",
                        background:
                          "var(--muted, rgba(127,127,127,0.08))",
                        aspectRatio: "4 / 3",
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={image}
                        alt={title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />

                      <div
                        style={{
                          position: "absolute",
                          top: 10,
                          left: 10,
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <Badge
                          variant={
                            ad.isActive
                              ? "success"
                              : "secondary"
                          }
                        >
                          {ad.isActive
                            ? "Active"
                            : "Inactive"}
                        </Badge>

                        {ad.creativeType ? (
                          <Badge variant="secondary">
                            {ad.creativeType}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        aspectRatio: "4 / 3",
                        display: "grid",
                        placeItems: "center",
                        background:
                          "var(--muted, rgba(127,127,127,0.08))",
                      }}
                    >
                      <span className="muted-text">
                        Creative preview unavailable
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <span
                        className="metric-title"
                        style={{
                          fontWeight: 700,
                        }}
                      >
                        {advertiser}
                      </span>

                      {ad.partnershipType ===
                      "creator" ? (
                        <Badge variant="secondary">
                          Creator
                        </Badge>
                      ) : null}
                    </div>

                    <h4
                      style={{
                        margin: "10px 0 0",
                        lineHeight: 1.35,
                      }}
                    >
                      {title}
                    </h4>

                    {ad.primaryText ? (
                      <p
                        style={{
                          margin: "9px 0 0",
                          fontSize: "0.92rem",
                          lineHeight: 1.55,
                          display: "-webkit-box",
                          WebkitLineClamp: 4,
                          WebkitBoxOrient:
                            "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {ad.primaryText}
                      </p>
                    ) : null}

                    {ad.offer ? (
                      <div
                        style={{
                          marginTop: 11,
                          padding: "9px 10px",
                          borderRadius: 9,
                          background:
                            "rgba(16, 185, 129, 0.08)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.76rem",
                            fontWeight: 700,
                            textTransform:
                              "uppercase",
                            letterSpacing:
                              "0.04em",
                          }}
                        >
                          Offer
                        </span>

                        <div
                          style={{
                            marginTop: 2,
                            fontSize: "0.9rem",
                            fontWeight: 600,
                          }}
                        >
                          {ad.offer}
                        </div>
                      </div>
                    ) : null}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(2, minmax(0, 1fr))",
                        gap: 8,
                        marginTop: 14,
                      }}
                    >{(
  [
    {
      label: "Creative",
      score: ad.creativeScore,
    },
    {
      label: "Longevity",
      score: ad.longevityScore,
    },
    {
      label: "Relevance",
      score: ad.relevanceScore,
    },
    {
      label: "Engagement",
      score: ad.engagementPotentialScore,
    },
  ] satisfies Array<{
    label: string;
    score: number | null | undefined;
  }>
).map(({ label, score }) => (
                        <div
                          key={String(label)}
                          style={{
                            padding: 9,
                            borderRadius: 9,
                            background:
                              "var(--muted, rgba(127,127,127,0.07))",
                            display: "flex",
                            alignItems: "center",
                            justifyContent:
                              "space-between",
                            gap: 8,
                          }}
                        >
                          <div>
                            <div
                              className="muted-text"
                              style={{
                                fontSize: "0.72rem",
                              }}
                            >
                              {label}
                            </div>

                            <strong>
                              {scoreLabel(
                                score
                              )}
                            </strong>
                          </div>

                          <Badge
                            variant={scoreTone(score)}
                          >
                            /100
                          </Badge>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        marginTop: 12,
                      }}
                    >
                      {ad.callToAction ? (
                        <Badge variant="secondary">
                          {ad.callToAction}
                        </Badge>
                      ) : null}

                      {typeof ad.runningDays ===
                        "number" &&
                      ad.runningDays > 0 ? (
                        <Badge variant="secondary">
                          {ad.runningDays} days
                        </Badge>
                      ) : null}

                      {ad.publisherPlatforms
                        ?.slice(0, 3)
                        .map((platform) => (
                          <Badge
                            key={`${ad.id}-${platform}`}
                            variant="secondary"
                          >
                            {platform}
                          </Badge>
                        ))}
                    </div>

                    <div
                      className="muted-text"
                      style={{
                        marginTop: 11,
                        fontSize: "0.8rem",
                        lineHeight: 1.5,
                      }}
                    >
                      {ad.firstSeen ? (
                        <div>
                          Started:{" "}
                          {formatDate(
                            ad.firstSeen
                          )}
                        </div>
                      ) : null}

                      {ad.lastSeen ? (
                        <div>
                          Last seen:{" "}
                          {formatDate(
                            ad.lastSeen
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div
                      className="action-row"
                      style={{
                        marginTop: "auto",
                        paddingTop: 15,
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {landingPage ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            openExternalUrl(
                              landingPage
                            )
                          }
                        >
                          View Landing Page
                        </Button>
                      ) : null}

                      {sourceUrl ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            openExternalUrl(
                              sourceUrl
                            )
                          }
                        >
                          Ad Library
                        </Button>
                      ) : null}

                      {videoUrl ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            openExternalUrl(
                              videoUrl
                            )
                          }
                        >
                          Watch Video
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {pagination ? (
            <div
              className="surface"
              style={{
                marginTop: 20,
                padding: 14,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <Button
                type="button"
                variant="secondary"
                disabled={
                  loading ||
                  !pagination.hasPreviousPage
                }
                onClick={() =>
                  goToPage(
                    pagination.previousPage ??
                      page - 1
                  )
                }
              >
                Previous
              </Button>

              <Badge variant="secondary">
                Page {pagination.page} of{" "}
                {pagination.totalPages}
              </Badge>

              <Button
                type="button"
                variant="secondary"
                disabled={
                  loading ||
                  !pagination.hasNextPage
                }
                onClick={() =>
                  goToPage(
                    pagination.nextPage ??
                      page + 1
                  )
                }
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
