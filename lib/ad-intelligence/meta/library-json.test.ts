import { describe, expect, it } from "vitest";

import { extractLibraryPage, normalizeLibraryNode } from "./library-json";

// Structure matches real Ad Library payloads (trimmed).
const node = (id: string, extra: Record<string, unknown> = {}) => ({
  ad_archive_id: id,
  page_id: "619181354927737",
  is_active: true,
  start_date: 1756684800, // 2025-09-01
  end_date: 1758499200,
  publisher_platform: ["FACEBOOK", "INSTAGRAM"],
  collation_count: 3,
  collation_id: `9${id}`,
  snapshot: {
    page_id: "619181354927737",
    page_name: "Mamaearth",
    body: { text: "Get 30% off on Vitamin C face wash. Shop now!" },
    title: "Vitamin C Face Wash",
    link_url: "https://mamaearth.in/product/vit-c",
    cta_text: "Shop now",
    display_format: "VIDEO",
    videos: [{ video_hd_url: "https://video.fbcdn.net/v.mp4", video_preview_image_url: "https://scontent.fbcdn.net/p.jpg" }],
    images: [],
    cards: [],
  },
  ...extra,
});

const DCO = node("2234567", {
  snapshot: {
    page_id: "619181354927737",
    page_name: "Mamaearth",
    body: { text: "{{product.name}}" },
    display_format: "DCO",
    cards: [{ body: "Real copy from card", title: "Onion Hair Oil", link_url: "https://mamaearth.in/onion", original_image_url: "https://scontent.fbcdn.net/c.jpg" }],
  },
});

const PARTNERSHIP = node("3234567", {
  snapshot: {
    page_id: "528733020321862",
    page_name: "Some Creator",
    body: { text: "I love this serum" },
    display_format: "IMAGE",
    images: [{ original_image_url: "https://scontent.fbcdn.net/i.jpg" }],
    branded_content: { page_id: "619181354927737", page_name: "Mamaearth" },
  },
});

const HTML =
  '<script type="application/json">{"require":[["x",{"data":{"ad_library_main":{"search_results_connection":{"count":768,"edges":[' +
  `{"node":{"collated_results":[${JSON.stringify(node("1234567"))},${JSON.stringify(DCO)}]}},` +
  `{"node":{"collated_results":[${JSON.stringify(PARTNERSHIP)}]}}],` +
  '"page_info":{"end_cursor":"AQHabc","has_next_page":true}}}}}],["other",{"page_info":{"has_next_page":false}}]]}</script>';

describe("extractLibraryPage", () => {
  it("reads every ad, the total count and paging from the page HTML", () => {
    const page = extractLibraryPage(HTML);
    expect(page.nodes).toHaveLength(3);
    expect(page.totalCount).toBe(768);
    expect(page.hasNextPage).toBe(true);
    expect(page.endCursor).toBe("AQHabc");
    expect(page.rateLimited).toBe(false);
  });

  it("detects the last page", () => {
    const last = extractLibraryPage(
      `{"data":{"ad_library_main":{"search_results_connection":{"count":768,"edges":[{"node":{"collated_results":[${JSON.stringify(
        node("4234567"),
      )}]}}],"page_info":{"end_cursor":null,"has_next_page":false}}}}}`,
    );
    expect(last.hasNextPage).toBe(false);
    expect(last.nodes).toHaveLength(1);
  });

  it("flags Meta's rate limit and survives broken chunks", () => {
    expect(extractLibraryPage('{"errors":[{"code":1675004,"message":"Rate limit"}]}').rateLimited).toBe(true);
    expect(extractLibraryPage('garbage "collated_results":[{"broken"').nodes).toHaveLength(0);
  });
});

describe("normalizeLibraryNode", () => {
  it("maps a video ad", () => {
    const ad = normalizeLibraryNode(node("1234567"))!;
    expect(ad.format).toBe("video");
    expect(ad.firstSeen).toBe("2025-09-01");
    expect(ad.lastSeen).toBeNull();
    expect(ad.pageName).toBe("Mamaearth");
    expect(ad.primaryText).toBe("Get 30% off on Vitamin C face wash. Shop now!");
    expect(ad.publisherPlatforms).toEqual(["Facebook", "Instagram"]);
    expect(ad.thumbnailUrl).toBe("https://scontent.fbcdn.net/p.jpg");
    expect(ad.creatorName).toBeNull();
  });

  it("uses card copy when the top level has DCO placeholders", () => {
    const ad = normalizeLibraryNode(DCO)!;
    expect(ad.primaryText).toBe("Real copy from card");
    expect(ad.headline).toBe("Onion Hair Oil");
    expect(ad.imageUrl).toBe("https://scontent.fbcdn.net/c.jpg");
  });

  it("keeps the brand as advertiser and the creator separately for partnership ads", () => {
    const ad = normalizeLibraryNode(PARTNERSHIP)!;
    expect(ad.pageId).toBe("619181354927737");
    expect(ad.pageName).toBe("Mamaearth");
    expect(ad.creatorName).toBe("Some Creator");
    expect(ad.creatorPageId).toBe("528733020321862");
  });
});
