import { describe, expect, it } from "vitest";
import type { AutocompleteAdvertiser } from "./adspy-types";
import { mergeAdvertiserSuggestions } from "./merge-advertiser-suggestions";

function advertiser(overrides: Partial<AutocompleteAdvertiser> & Pick<AutocompleteAdvertiser, "id" | "pageId" | "label" | "source">): AutocompleteAdvertiser {
  return {
    type: "advertiser",
    domain: null,
    profileUrl: null,
    profileImageUrl: null,
    category: null,
    verification: null,
    likes: null,
    igFollowers: null,
    ...overrides,
  };
}

describe("mergeAdvertiserSuggestions", () => {
  it("preserves distinct Page IDs even when labels are identical", () => {
    const result = mergeAdvertiserSuggestions([], [
      advertiser({ id: "meta:100", pageId: "100", label: "Wild Date", source: "meta_public" }),
      advertiser({ id: "meta:200", pageId: "200", label: "Wild Date", source: "meta_public" }),
    ], "wild date");
    expect(result.map((x) => x.pageId)).toEqual(["100", "200"]);
  });

  it("prefers live metadata for the same Page ID without erasing indexed metadata", () => {
    const indexed = advertiser({ id: "100", pageId: "100", label: "Wild Date", source: "indexed", category: "Shopping", likes: 50 });
    const live = advertiser({ id: "meta:100", pageId: "100", label: "Wild Date Official", source: "meta_public", profileImageUrl: "https://example.test/p.png" });
    const result = mergeAdvertiserSuggestions([indexed], [live], "wild date");
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("meta_public");
    expect(result[0].label).toBe("Wild Date Official");
    expect(result[0].category).toBe("Shopping");
    expect(result[0].likes).toBe(50);
  });

  it("filters unrelated fuzzy indexed rows and stale live results", () => {
    const result = mergeAdvertiserSuggestions([
      advertiser({ id: "1", pageId: "1", label: "Wild Squat", source: "indexed" }),
      advertiser({ id: "2", pageId: "2", label: "Wild Date", source: "indexed" }),
    ], [
      advertiser({ id: "meta:3", pageId: "3", label: "Wildlife Updates", source: "meta_public" }),
    ], "wild date");
    expect(result.map((x) => x.label)).toEqual(["Wild Date"]);
  });

  it("does not let a popular-brand placeholder mask a real Meta page", () => {
    const result = mergeAdvertiserSuggestions([
      advertiser({ id: "popular-wild-date", pageId: "", label: "Wild Date", source: "indexed" }),
    ], [
      advertiser({ id: "meta:100", pageId: "100", label: "Wild Date", source: "meta_public" }),
    ], "wild date");
    expect(result.map((x) => x.pageId)).toEqual(["100"]);
  });

  it("keeps useful local-only fallbacks and enforces the row limit", () => {
    const indexed = Array.from({ length: 15 }, (_, i) => advertiser({ id: `popular-${i}`, pageId: "", label: `Wild Date Brand ${i}`, source: "indexed" }));
    expect(mergeAdvertiserSuggestions(indexed, [], "wild date", 12)).toHaveLength(12);
  });
});
