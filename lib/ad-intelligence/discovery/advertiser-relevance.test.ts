import { describe, expect, it } from "vitest";
import { isRelevantAdvertiserMatch } from "./advertiser-relevance";

describe("isRelevantAdvertiserMatch", () => {
  it("accepts the exact advertiser name", () => {
    expect(isRelevantAdvertiserMatch("wild date", "Wild Date")).toBe(true);
  });

  it("accepts a name that contains the full query", () => {
    expect(isRelevantAdvertiserMatch("wild date", "Wild Date Official")).toBe(true);
  });

  it("rejects unrelated fuzzy-index candidates", () => {
    expect(isRelevantAdvertiserMatch("wild date", "dan_wildlif3")).toBe(false);
    expect(isRelevantAdvertiserMatch("wild date", "Wild Squat")).toBe(false);
  });

  it("matches a domain or Instagram username after removing URL syntax", () => {
    expect(isRelevantAdvertiserMatch("wilddateofficial", "A different display name", "https://www.instagram.com/wilddateofficial/")).toBe(true);
  });

  it("does not treat empty search input as a match", () => {
    expect(isRelevantAdvertiserMatch("   ", "Wild Date")).toBe(false);
  });
});
