import { describe, expect, it } from "vitest";

import { extractMetaSearchResultsCount } from "./library-json";

describe("extractMetaSearchResultsCount", () => {
  it("reads count when other connection fields precede it", () => {
    const body = JSON.stringify({
      data: {
        search_results_connection: {
          __typename: "AdLibrarySearchResultsConnection",
          edges: [],
          count: 180,
          page_info: { has_next_page: false },
        },
      },
    });
    expect(extractMetaSearchResultsCount(body)).toBe(180);
  });

  it("uses the largest root count across HTML and later GraphQL pages", () => {
    const body = JSON.stringify({
      first: { search_results_connection: { count: 30, edges: [] } },
      next: { search_results_connection: { __typename: "Connection", count: 180, edges: [] } },
    });
    expect(extractMetaSearchResultsCount(body)).toBe(180);
  });

  it("does not mistake a nested count for the connection total", () => {
    const body = JSON.stringify({
      data: { search_results_connection: { edges: [{ node: { metrics: { count: 8 } } }] } },
    });
    expect(extractMetaSearchResultsCount(body)).toBeNull();
  });

  it("returns null when Meta provides no total", () => {
    expect(extractMetaSearchResultsCount('{"data":{"search_results_connection":{"edges":[]}}}')).toBeNull();
  });
});
