"use client";

import {
  Loader2,
  Search,
  UserRound,
} from "lucide-react";

export type AutocompleteAdvertiser = {
  id: string;
  label: string;
  domain?: string | null;
  type: "advertiser";
};

export type AutocompleteQuery = {
  id: string;
  label: string;
  type: "query";
};

type Props = {
  query: string;
  open: boolean;
  loading: boolean;
  advertisers: AutocompleteAdvertiser[];
  onSelectQuery: (query: string) => void;
  onSelectAdvertiser: (
    advertiser: AutocompleteAdvertiser,
  ) => void;
};

export function AdSpyAutocomplete({
  query,
  open,
  loading,
  advertisers,
  onSelectQuery,
  onSelectAdvertiser,
}: Props) {
  if (!open || query.trim().length < 2) {
    return null;
  }

  const trimmedQuery = query.trim();

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
          <Loader2
            size={14}
            className="zt-spin"
            aria-label="Loading suggestions"
          />
        ) : null}
      </div>

      <button
        type="button"
        className="zt-suggestion zt-suggestion-query"
        role="option"
        aria-selected="false"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          onSelectQuery(trimmedQuery);
        }}
      >
        <span className="zt-suggestion-icon">
          <Search size={15} />
        </span>

        <span className="zt-suggestion-content">
          <strong>
            &quot;{trimmedQuery}&quot;
          </strong>

          <small>
            Search this exact phrase
          </small>
        </span>
      </button>

      {advertisers.length > 0 ? (
        <>
          <div className="zt-suggestion-section">
            Advertisers
          </div>

          {advertisers.map((advertiser) => (
            <button
              key={`advertiser:${advertiser.id}:${advertiser.label}`}
              type="button"
              className="zt-suggestion"
              role="option"
              aria-selected="false"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                onSelectAdvertiser(
                  advertiser,
                );
              }}
            >
              <span className="zt-suggestion-icon">
                <UserRound size={15} />
              </span>

              <span className="zt-suggestion-content">
                <strong>
                  {advertiser.label}
                </strong>

                <small>
                  {advertiser.domain
                    ? advertiser.domain
                    : "Advertiser"}
                </small>
              </span>
            </button>
          ))}
        </>
      ) : loading ? (
        <div className="zt-suggestion-status">
          Finding matching advertisers…
        </div>
      ) : null}
    </div>
  );
}