
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  scrapeCreatorsMetaPageSearch,
  SCRAPECREATORS_PAGE_SEARCH_ENDPOINT,
  isScrapeCreatorsPageSearchEnabled,
} from "./scrapecreators-page-search";

function response(
  payload: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("ScrapeCreators Meta Page Search", () => {
  it("calls the Search for Companies endpoint with query and x-api-key", async () => {
    const captured: Array<{
      url: URL;
      key: string;
    }> = [];

    const fetchImpl: typeof fetch = async (input, init) => {
      captured.push({
        url: new URL(String(input)),
        key:
          new Headers(init?.headers).get("x-api-key") ?? "",
      });

      return response({
        success: true,
        credits_charged: 1,
        searchResults: [
          {
            page_id: "123456",
            name: "Wild Date",
            category: "Brand",
            image_uri: "https://example.com/page.jpg",
            verification: "BLUE_VERIFIED",
            likes: 55,
          },
        ],
      });
    };

    const result = await scrapeCreatorsMetaPageSearch(
      "Wild date",
      "IN",
      {
        apiKey: "test-key",
        fetchImpl,
      }
    );

    expect(captured).toHaveLength(1);

    expect(
      captured[0].url.origin + captured[0].url.pathname
    ).toBe(SCRAPECREATORS_PAGE_SEARCH_ENDPOINT);

    expect(
      captured[0].url.searchParams.get("query")
    ).toBe("Wild date");

    expect(
      captured[0].url.searchParams.has("country")
    ).toBe(false);

    expect(captured[0].key).toBe("test-key");
    expect(result.status).toBe("found");

    expect(result.pages).toMatchObject([
      {
        pageId: "123456",
        name: "Wild Date",
        category: "Brand",
        likes: 55,
      },
    ]);
  });

  it("keeps distinct numeric pages even when their names match", async () => {
    const result = await scrapeCreatorsMetaPageSearch(
      "Mokobara",
      "IN",
      {
        apiKey: "test-key",
        fetchImpl: async () =>
          response({
            success: true,
            searchResults: [
              { page_id: "100", name: "Mokobara" },
              { page_id: "200", name: "Mokobara" },
              { page_id: "100", name: "Mokobara" },
              {
                page_id: "not-a-page-id",
                name: "Mokobara",
              },
              {
                page_id: "300",
                name: "Mokobara",
                page_is_deleted: true,
              },
            ],
          }),
      }
    );

    expect(
      result.pages.map((page) => page.pageId)
    ).toEqual(["100", "200"]);
  });

  it("rejects unrelated fuzzy suggestions", async () => {
    const result = await scrapeCreatorsMetaPageSearch(
      "Wild Date",
      "IN",
      {
        apiKey: "test-key",
        fetchImpl: async () =>
          response({
            success: true,
            searchResults: [
              { page_id: "10", name: "Wild Date" },
              { page_id: "11", name: "Wild Squat" },
              {
                page_id: "12",
                name: "dan_wildlif3",
              },
            ],
          }),
      }
    );

    expect(result.status).toBe("found");

    expect(
      result.pages.map((page) => page.name)
    ).toEqual(["Wild Date"]);
  });

  it("distinguishes a valid empty result from a provider failure and isolates test transports from cache", async () => {
    const empty = await scrapeCreatorsMetaPageSearch(
      "NoBrandMatch",
      "IN",
      {
        apiKey: "test-key",
        fetchImpl: async () =>
          response({
            success: true,
            searchResults: [],
          }),
      }
    );

    expect(empty.status).toBe("no_match");

    const failed = await scrapeCreatorsMetaPageSearch(
      "Mokobara",
      "IN",
      {
        apiKey: "test-key",
        fetchImpl: async () =>
          response(
            {
              success: false,
              error: "unauthorized",
            },
            401
          ),
      }
    );

    expect(failed.status).toBe("error");
  });

  it("returns timeout status when provider exceeds its deadline", async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () =>
            reject(
              new DOMException("Aborted", "AbortError")
            ),
          { once: true }
        );
      });

    const result = await scrapeCreatorsMetaPageSearch(
      "TimeoutProbeBrand",
      "IN",
      {
        apiKey: "test-key",
        timeoutMs: 25,
        fetchImpl,
      }
    );

    expect(result.status).toBe("timeout");
    expect(result.pages).toEqual([]);
  });
});

describe("ScrapeCreators provider switch", () => {
  it.each(["off", "disabled"])(
    "disables live discovery for %s even when an API key exists",
    (choice) => {
      vi.stubEnv("SCRAPECREATORS_API_KEY", "test-key");
      vi.stubEnv(
        "ZOOPLENS_META_PAGE_SEARCH_PROVIDER",
        choice
      );

      expect(
        isScrapeCreatorsPageSearchEnabled()
      ).toBe(false);
    }
  );

  it("enables explicit ScrapeCreators configuration when a key exists", () => {
    vi.stubEnv(
      "ZOOPLENS_META_PAGE_SEARCH_PROVIDER",
      "scrapecreators"
    );
    vi.stubEnv("SCRAPECREATORS_API_KEY", "test-key");

    expect(
      isScrapeCreatorsPageSearchEnabled()
    ).toBe(true);
  });

  it("does not enable explicit ScrapeCreators configuration without a key", () => {
    vi.stubEnv(
      "ZOOPLENS_META_PAGE_SEARCH_PROVIDER",
      "scrapecreators"
    );
    vi.stubEnv("SCRAPECREATORS_API_KEY", "");

    expect(
      isScrapeCreatorsPageSearchEnabled()
    ).toBe(false);
  });

  it("uses API-key availability in auto mode", () => {
    vi.stubEnv(
      "ZOOPLENS_META_PAGE_SEARCH_PROVIDER",
      "auto"
    );
    vi.stubEnv("SCRAPECREATORS_API_KEY", "test-key");

    expect(
      isScrapeCreatorsPageSearchEnabled()
    ).toBe(true);

    vi.stubEnv("SCRAPECREATORS_API_KEY", "");

    expect(
      isScrapeCreatorsPageSearchEnabled()
    ).toBe(false);
  });

  it("disables live discovery for an unknown provider setting", () => {
    vi.stubEnv(
      "ZOOPLENS_META_PAGE_SEARCH_PROVIDER",
      "unknown-provider"
    );
    vi.stubEnv("SCRAPECREATORS_API_KEY", "test-key");

    expect(
      isScrapeCreatorsPageSearchEnabled()
    ).toBe(false);
  });
});
