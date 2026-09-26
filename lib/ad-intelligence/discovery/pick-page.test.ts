import { describe, expect, it } from "vitest";

import { pageChoices, pickExactPage } from "./pick-page";

const moon = { pageId: "1", label: "Moon & Mars Resort", verification: null };
const cafe = { pageId: "2", label: "Mars Cafe", verification: null };
const cosmetics = { pageId: "3", label: "MARS Cosmetics", verification: "BLUE_VERIFIED" };

describe("pickExactPage", () => {
  it("picks the single exact name match", () => {
    expect(pickExactPage("mars cafe", [moon, cafe, cosmetics])?.pageId).toBe("2");
    expect(pickExactPage("MARS-Cosmetics", [moon, cafe, cosmetics])?.pageId).toBe("3");
  });

  it("accepts a single VERIFIED prefix match", () => {
    expect(pickExactPage("mars", [moon, cosmetics])?.pageId).toBe("3");
  });

  it("does not guess from unverified prefixes or contains-matches", () => {
    expect(pickExactPage("mars", [moon, cafe])).toBeNull();
    expect(pickExactPage("moon", [{ ...moon, verification: null }])).toBeNull();
  });

  it("returns null when ambiguous", () => {
    const twin = { pageId: "4", label: "Mars Cafe", verification: null };
    expect(pickExactPage("mars cafe", [cafe, twin])).toBeNull();
    const verified2 = { pageId: "5", label: "Mars Wrigley", verification: "VERIFIED" };
    expect(pickExactPage("mars", [cosmetics, verified2])).toBeNull();
  });

  it("treats the same page twice as one", () => {
    expect(pickExactPage("mars cafe", [cafe, { ...cafe }])?.pageId).toBe("2");
  });

  it("rejects invalid page ids and short queries", () => {
    expect(pickExactPage("mars cafe", [{ pageId: "abc", label: "Mars Cafe" }])).toBeNull();
    expect(pickExactPage("m", [cafe])).toBeNull();
    expect(pickExactPage("not verified", [{ pageId: "9", label: "Not Verified Shop", verification: "NOT_VERIFIED" }])).toBeNull();
  });
});

describe("pageChoices", () => {
  it("lists distinct pages containing the query", () => {
    expect(pageChoices("mars", [moon, cafe, cosmetics, { ...cafe }, { pageId: "7", label: "Venus" }]).map((c) => c.pageId)).toEqual(["1", "2", "3"]);
  });
});
