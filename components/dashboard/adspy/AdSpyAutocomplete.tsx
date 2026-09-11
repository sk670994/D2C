"use client";

import { Loader2, Search, UserRound } from "lucide-react";

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
  onSelectQuery: (query: string) => void;
  onSelectAdvertiser: (advertiser: AutocompleteAdvertiser) => void;
};

function formatCompactCount(value?: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;

  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function usernameFromDomain(domain?: string | null): string | null {
  if (!domain) return null;

  try {
    const parsed = new URL(domain);
    const username = parsed.pathname.replace(/^\/+|\/+$/g, "");
    return username ? `@${decodeURIComponent(username)}` : null;
  } catch {
    return null;
  }
}

function metaLine(advertiser: AutocompleteAdvertiser): string {
  const pieces: string[] = [];

  const fb =
    advertiser.likes != null
      ? `${formatCompactCount(advertiser.likes)} followers`
      : null;

  if (advertiser.category) {
    pieces.push(advertiser.category);
  }

  if (fb) {
    pieces.push(fb);
  }

  return pieces.join(" · ") || "Advertiser";
}

function instagramLine(advertiser: AutocompleteAdvertiser): string | null {
  const username = usernameFromDomain(advertiser.domain);
  const followers = formatCompactCount(advertiser.igFollowers);

  if (!username && !followers) return null;

  return [username, followers ? `${followers} followers` : null]
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
  const trimmedQuery = query.trim();

  if (!open || trimmedQuery.length < 2) {
    return null;
  }

  return (
    <div
      className="zt-suggestions"
      role="listbox"
      id="adspy-search-suggestions"
      aria-label="Search suggestions"
    >
      <div className="zt-suggestion-head">
        <span>Suggestions</span>
        {loading ? (
          <Loader2 size={14} className="zt-spin" aria-label="Loading" />
        ) : null}
      </div>

      <button
        type="button"
        className="zt-suggestion zt-suggestion-query"
        role="option"
        aria-selected="false"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSelectQuery(trimmedQuery)}
      >
        <span className="zt-suggestion-icon">
          <Search size={15} />
        </span>

        <span className="zt-suggestion-content">
          <strong>&quot;{trimmedQuery}&quot;</strong>
          <small>Search this exact phrase</small>
        </span>
      </button>

      <div className="zt-suggestion-section">Advertisers</div>

      {advertisers.length > 0 ? (
        advertisers.map((advertiser) => {
          const instagram = instagramLine(advertiser);

          return (
            <button
              key={`advertiser:${advertiser.pageId || advertiser.id}`}
              type="button"
              className="zt-suggestion"
              role="option"
              aria-selected="false"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectAdvertiser(advertiser)}
            >
              <span className="zt-suggestion-icon">
                {advertiser.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={advertiser.profileImageUrl}
                    alt=""
                    width={30}
                    height={30}
                    loading="lazy"
                  />
                ) : (
                  <UserRound size={15} />
                )}
              </span>

              <span className="zt-suggestion-content">
                <strong>
                  {advertiser.label}
                  {advertiser.verification === "VERIFIED" ? " ✓" : ""}
                </strong>

                <small>{metaLine(advertiser)}</small>

                {instagram ? <small>{instagram}</small> : null}
              </span>
            </button>
          );
        })
      ) : loading ? (
        <div className="zt-suggestion-status">
          Finding matching advertisers…
        </div>
      ) : (
        <div className="zt-suggestion-status">
          No advertiser match yet
        </div>
      )}
    </div>
  );
}
