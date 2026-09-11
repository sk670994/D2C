"use client";

/*
 * We intentionally use <img> for third-party advertiser/profile images.
 *
 * These URLs come dynamically from external ad-intelligence providers and
 * may not belong to a fixed allow-list of remote hosts. Using plain <img>
 * avoids coupling the autocomplete to Next Image remotePatterns and keeps
 * advertiser discovery resilient.
 */
/* eslint-disable @next/next/no-img-element */

import {
  Loader2,
  Search,
  UserRound,
} from "lucide-react";

export type AutocompleteAdvertiser = {
  id: string;
  pageId: string;
  label: string;
  type: "advertiser";
  domain?: string | null;
  profileUrl?: string | null;
  profileImageUrl?: string | null;
  category?: string | null;
  verification?: string | null;
  likes?: number | null;
  igFollowers?: number | null;
};

type Props = {
  query: string;
  open: boolean;
  loading: boolean;
  advertisers: AutocompleteAdvertiser[];
  onSelectQuery: (
    query: string,
  ) => void;
  onSelectAdvertiser: (
    advertiser: AutocompleteAdvertiser,
  ) => void;
};

function formatCompactCount(
  value?: number | null,
): string | null {
  if (
    value == null ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return new Intl.NumberFormat(
    "en-IN",
    {
      notation: "compact",
      maximumFractionDigits: 1,
    },
  ).format(value);
}

function usernameFromDomain(
  domain?: string | null,
): string | null {
  if (!domain) {
    return null;
  }

  try {
    const parsed = new URL(
      domain,
    );

    const username =
      parsed.pathname
        .replace(
          /^\/+|\/+$/g,
          "",
        )
        .trim();

    return username
      ? `@${decodeURIComponent(
          username,
        )}`
      : null;
  } catch {
    return null;
  }
}

function metaLine(
  advertiser: AutocompleteAdvertiser,
): string {
  const pieces: string[] = [];

  if (advertiser.category) {
    pieces.push(
      advertiser.category,
    );
  }

  if (
    advertiser.likes != null
  ) {
    const likes =
      formatCompactCount(
        advertiser.likes,
      );

    if (likes) {
      pieces.push(
        `${likes} followers`,
      );
    }
  }

  return (
    pieces.join(" · ") ||
    "Advertiser"
  );
}

function instagramLine(
  advertiser: AutocompleteAdvertiser,
): string | null {
  const username =
    usernameFromDomain(
      advertiser.domain,
    );

  const followers =
    formatCompactCount(
      advertiser.igFollowers,
    );

  if (
    !username &&
    !followers
  ) {
    return null;
  }

  return [
    username,
    followers
      ? `${followers} followers`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AdSpyAutocomplete({
  query,
  open,
  loading,
  advertisers,
  onSelectQuery,
  onSelectAdvertiser,
}: Props) {
  const trimmedQuery =
    query.trim();

  if (
    !open ||
    trimmedQuery.length < 2
  ) {
    return null;
  }

  return (
    <div
      id="adspy-search-suggestions"
      className="zt-suggestions"
      role="listbox"
      aria-label="Search suggestions"
    >
      <div className="zt-suggestion-head">
        <span>
          Suggestions
        </span>

        {loading ? (
          <Loader2
            size={14}
            className="zt-spin"
            aria-label="Loading advertiser suggestions"
          />
        ) : null}
      </div>

      {/* Exact phrase search */}
      <button
        type="button"
        role="option"
        aria-selected={false}
        className="zt-suggestion zt-suggestion-query"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() =>
          onSelectQuery(
            trimmedQuery,
          )
        }
      >
        <span className="zt-suggestion-icon">
          <Search size={15} />
        </span>

        <span className="zt-suggestion-content">
          <strong>
            &quot;
            {trimmedQuery}
            &quot;
          </strong>

          <small>
            Search this exact phrase
          </small>
        </span>
      </button>

      {/* Advertiser section */}
      <div
        className="zt-suggestion-section"
        role="presentation"
      >
        Advertisers
      </div>

      {advertisers.length > 0
        ? advertisers.map(
            (
              advertiser,
            ) => {
              const instagram =
                instagramLine(
                  advertiser,
                );

              return (
                <button
                  key={
                    advertiser.pageId ||
                    advertiser.id
                  }
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="zt-suggestion zt-advertiser-suggestion"
                  onMouseDown={(
                    event,
                  ) => {
                    event.preventDefault();
                  }}
                  onClick={() =>
                    onSelectAdvertiser(
                      advertiser,
                    )
                  }
                >
                  <span className="zt-suggestion-icon">
                    {advertiser.profileImageUrl ? (
                      <img
                        src={
                          advertiser.profileImageUrl
                        }
                        alt=""
                        width={34}
                        height={34}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <UserRound
                        size={15}
                      />
                    )}
                  </span>

                  <span className="zt-suggestion-content">
                    <span className="zt-advertiser-name">
                      <strong>
                        {
                          advertiser.label
                        }

                        {advertiser.verification ===
                        "VERIFIED"
                          ? " ✓"
                          : ""}
                      </strong>
                    </span>

                    <small>
                      {metaLine(
                        advertiser,
                      )}
                    </small>

                    {instagram ? (
                      <small>
                        {instagram}
                      </small>
                    ) : null}
                  </span>
                </button>
              );
            },
          )
        : loading
          ? (
              <div
                className="zt-suggestion-status"
                role="status"
                aria-live="polite"
              >
                Finding matching
                advertisers…
              </div>
            )
          : (
              <div
                className="zt-suggestion-status"
                role="status"
                aria-live="polite"
              >
                No advertiser match
                yet
              </div>
            )}
    </div>
  );
}