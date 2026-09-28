import { describe, expect, it } from "vitest";

import {
  collectMetaAdsViaSearchApi,
  matchesBrandName,
  pickExactPage,
  searchApiRequestBody,
  toLibraryNode,
  toUnixSeconds,
  type SearchApiMetaAd,
} from "./searchapi-meta";
import { libraryNodeToAd } from "../meta/node-to-ad";

const AD: SearchApiMetaAd = {
  ad_archive_id: "1234567890123",
  page_id: "619181354927737",
  page_name: "Mamaearth",
  is_active: true,
  start_date: "2026-09-17T07:00:00Z",
  end_date: "2026-09-28T07:00:00Z",
  publisher_platform: ["FACEBOOK", "INSTAGRAM"],
  collation_count: 3,
  snapshot: {
    page_name: "Mamaearth",
    page_id: "619181354927737",
    body: { text: "Deep clean your pores. Get 25% off with code SAVE25" },
    title: "Pore Cleansing Foam Scrub",
    link_url: "https://mamaearth.in/product/scrub",
    cta_text: "Shop now",
    display_format: "VIDEO",
    images: [],
    videos: [{ video_hd_url: "https://video.fbcdn.net/v.mp4", video_preview_image_url: "https://scontent.fbcdn.net/p.jpg" }],
    cards: [],
  },
};

describe("toUnixSeconds", () => {
  it("reads ISO, seconds and milliseconds", () => {
    expect(toUnixSeconds("2026-09-17T00:00:00Z")).toBe(1789603200);
    expect(toUnixSeconds(1789603200)).toBe(1789603200);
    expect(toUnixSeconds(1789603200000)).toBe(1789603200);
    expect(toUnixSeconds("1789603200")).toBe(1789603200);
    expect(toUnixSeconds(null)).toBeNull();
    expect(toUnixSeconds("not a date")).toBeNull();
  });
});

describe("SearchApi ad -> CompetitorAd", () => {
  it("maps through the shared Meta mapper", () => {
    const ad = libraryNodeToAd(toLibraryNode(AD), { query: "Mamaearth", country: "IN", advertiserPageId: "619181354927737" }, "https://x", 452, {
      providerSource: "searchapi",
    });
    expect(ad?.id).toBe("1234567890123");
    expect(ad?.advertiserId).toBe("619181354927737");
    expect(ad?.advertiserName).toBe("Mamaearth");
    expect(ad?.creativeType).toBe("video");
    expect(ad?.videoUrl).toBe("https://video.fbcdn.net/v.mp4");
    expect(ad?.thumbnailUrl).toBe("https://scontent.fbcdn.net/p.jpg");
    expect(ad?.firstSeen).toBe("2026-09-17");
    expect(ad?.lastSeen).toBeNull();
    expect(ad?.isActive).toBe(true);
    expect(ad?.callToAction).toBe("Shop now");
    expect(ad?.landingPage).toBe("https://mamaearth.in/product/scrub");
    expect(ad?.metadata?.metaTotalCount).toBe(452);
    expect(ad?.metadata?.providerSource).toBe("searchapi");
  });

  it("drops ads from another page when a page ID was asked for", () => {
    const other = { ...AD, page_id: "111111111111", snapshot: { ...AD.snapshot, page_id: "111111111111" } };
    expect(libraryNodeToAd(toLibraryNode(other), { query: "x", advertiserPageId: "619181354927737" }, "u", null)).toBeNull();
  });
});

describe("searchApiRequestBody", () => {
  it("uses page_id when known, keyword otherwise", () => {
    const byPage = searchApiRequestBody({ query: "Mamaearth", country: "in", advertiserPageId: "619181354927737" });
    expect(byPage.page_id).toBe("619181354927737");
    expect(byPage.q).toBe(undefined);
    expect(byPage.country).toBe("IN");
    expect(byPage.sort_by).toBe("most_recent");
    const byName = searchApiRequestBody({ query: " boAt ", country: "IN" }, { nextPageToken: "tok" });
    expect(byName.q).toBe("boAt");
    expect(byName.search_type).toBe("keyword_unordered");
    expect(byName.next_page_token).toBe("tok");
  });
});

describe("brand name matching", () => {
  it("keeps the brand, drops pages that only mention the word", () => {
    expect(matchesBrandName({ advertiserName: "Mamaearth India" }, { query: "mamaearth", mode: "advertiser" })).toBe(true);
    expect(matchesBrandName({ advertiserName: "Mars Resort" }, { query: "boat", mode: "advertiser" })).toBe(false);
    expect(matchesBrandName({ advertiserName: "Anyone" }, { query: "boat", mode: "keyword" })).toBe(true);
  });

  it("resolves a page only when unambiguous", () => {
    expect(pickExactPage("boAt", [{ page_id: "123456", name: "boAt" }])).toEqual({ pageId: "123456", name: "boAt" });
    expect(pickExactPage("boAt", [{ page_id: "123456", name: "boAt" }, { page_id: "654321", name: "BOAT" }])).toBeNull();
    expect(
      pickExactPage("boAt", [
        { page_id: "123456", name: "boAt", verification: "BLUE_VERIFIED" },
        { page_id: "654321", name: "BOAT", verification: "NOT_VERIFIED" },
      ]),
    ).toEqual({ pageId: "123456", name: "boAt" });
    expect(pickExactPage("boAt", [{ page_id: "123456", name: "boAt Lifestyle" }])).toBeNull();
  });
});

/** Fake SearchApi: 3 pages of 2 ads. */
function fakeFetch(calls: Array<Record<string, string>>): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    calls.push(body);
    const page = body.next_page_token ? Number(body.next_page_token) : 0;
    const ads = [0, 1].map((i) => ({ ...AD, ad_archive_id: String(1000000 + page * 10 + i) }));
    return new Response(JSON.stringify({ search_information: { total_results: 6 }, ads, pagination: { next_page_token: page < 2 ? String(page + 1) : null } }), { status: 200 });
  }) as unknown as typeof fetch;
}

export const asyncChecks = (async () => {
  const calls: Array<Record<string, string>> = [];
  const got: string[] = [];
  const all = await collectMetaAdsViaSearchApi(
    { query: "Mamaearth", country: "IN", advertiserPageId: "619181354927737", deadlineAt: Date.now() + 120_000 },
    (batch) => void got.push(...batch.map((a) => a.id)),
    { apiKey: "test", fetchImpl: fakeFetch(calls) },
  );
  expect(all.calls).toBe(3);
  expect(all.ads).toBe(6);
  expect(all.stoppedBy).toBe("exhausted");
  expect(all.totalResults).toBe(6);
  expect(calls[1].next_page_token).toBe("1");

  // Incremental: everything already known -> stop after 2 pages.
  const calls2: Array<Record<string, string>> = [];
  const inc = await collectMetaAdsViaSearchApi(
    { query: "Mamaearth", country: "IN", advertiserPageId: "619181354927737", deadlineAt: Date.now() + 120_000, isKnown: () => true, stopAfterKnownPages: 2 },
    () => undefined,
    { apiKey: "test", fetchImpl: fakeFetch(calls2) },
  );
  expect(inc.calls).toBe(2);
  expect(inc.stoppedBy).toBe("caught_up");

  // Page cap.
  const capped = await collectMetaAdsViaSearchApi(
    { query: "Mamaearth", country: "IN", advertiserPageId: "619181354927737", deadlineAt: Date.now() + 120_000, maxPages: 1 },
    () => undefined,
    { apiKey: "test", fetchImpl: fakeFetch([]) },
  );
  expect(capped.stoppedBy).toBe("max_pages");
  return "async ok";
})();

it("pages, stops when caught up, respects the cap", async () => {
  await asyncChecks;
});
