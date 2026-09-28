import { expect, it } from "vitest";

import { collectMetaAdsViaScrapeCreators, parseScrapeCreatorsPage, scrapeCreatorsRequest } from "./scrapecreators-meta";

const node = (id: string) => ({
  ad_archive_id: id,
  page_id: "619181354927737",
  page_name: "Mamaearth",
  is_active: true,
  start_date: 1789603200,
  snapshot: { page_id: "619181354927737", page_name: "Mamaearth", body: { text: "Buy 2 get 1" }, images: [{ original_image_url: "https://scontent.x/i.jpg" }] },
});

it("builds company-ads and keyword requests", () => {
  const byPage = scrapeCreatorsRequest({ query: "Mamaearth", country: "in", advertiserPageId: "619181354927737" }, { cursor: "c1" });
  expect(byPage.path).toBe("/v1/facebook/adLibrary/company/ads");
  expect(byPage.body.pageId).toBe("619181354927737");
  expect(byPage.body.status).toBe("ALL");
  expect(byPage.body.country).toBe("IN");
  expect(byPage.body.cursor).toBe("c1");
  const byName = scrapeCreatorsRequest({ query: "boAt", country: "IN" }, { activeStatus: "active" });
  expect(byName.path).toBe("/v1/facebook/adLibrary/search/ads");
  expect(byName.body.query).toBe("boAt");
  expect(byName.body.status).toBe("ACTIVE");
});

it("reads results / searchResults and the cursor", () => {
  const a = parseScrapeCreatorsPage({ results: [node("1000001") as never], cursor: "next" }, 5);
  expect(a.ads).toHaveLength(1);
  expect(a.nextPageToken).toBe("next");
  const b = parseScrapeCreatorsPage({ searchResults: [node("1000002") as never], searchResultsCount: 452 }, 5);
  expect(b.totalResults).toBe(452);
  expect(b.nextPageToken).toBeNull();
});

export const scAsync = (async () => {
  let calls = 0;
  const fake = (async (_url: string, init: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(init.body)) as { cursor?: string };
    const page = body.cursor ? Number(body.cursor) : 0;
    return new Response(JSON.stringify({ success: true, results: [node(String(2000000 + page))], cursor: page < 1 ? "1" : null }), { status: 200 });
  }) as unknown as typeof fetch;
  const got: string[] = [];
  const out = await collectMetaAdsViaScrapeCreators(
    { query: "Mamaearth", country: "IN", advertiserPageId: "619181354927737", deadlineAt: Date.now() + 60_000 },
    (batch) => void got.push(...batch.map((a) => `${a.id}:${a.metadata?.providerSource}:${a.firstSeen}`)),
    { apiKey: "k", fetchImpl: fake },
  );
  expect(calls).toBe(2);
  expect(out.ads).toBe(2);
  expect(got[0]).toBe("2000000:scrapecreators:2026-09-17");
  return "sc ok";
})();

it("pages through ScrapeCreators with the shared loop", async () => {
  await scAsync;
});
