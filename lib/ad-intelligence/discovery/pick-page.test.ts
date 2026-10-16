import { describe, expect, it } from "vitest";

import { pageChoices, pickBrandPage, pickExactPage } from "./pick-page";

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

describe("accents", () => {
  it("matches L'Oréal typed without the accent", () => {
    const pages = [
      { pageId: "111", label: "L'Oréal Paris", verification: "BLUE_VERIFIED" },
      { pageId: "222", label: "Loreal Fan Club", verification: null },
    ];
    expect(pickExactPage("L'Oreal Paris", pages)?.pageId).toBe("111");
    expect(pickExactPage("loreal paris", pages)?.pageId).toBe("111");
  });
});

describe("pickBrandPage (nightly seed)", () => {
  const v = "BLUE_VERIFIED";
  it("prefers the one verified page among same-name pages", () => {
    const r = pickBrandPage("Garnier", [
      { pageId: "1", label: "Garnier", verification: null, likes: 900 },
      { pageId: "2", label: "Garnier", verification: v, likes: 100 },
    ]);
    expect(r.page?.pageId).toBe("2");
    expect(r.reason).toBe("clear_lead");
  });
  it("accepts a single verified page containing the brand", () => {
    expect(pickBrandPage("Man Company", [{ pageId: "3", label: "The Man Company", verification: v }]).page?.pageId).toBe("3");
  });
  it("uses audience only with a 10x lead", () => {
    const pages = [
      { pageId: "4", label: "Foxtale India", verification: v, likes: 500_000 },
      { pageId: "5", label: "Foxtale Global", verification: v, likes: 20_000 },
    ];
    expect(pickBrandPage("Foxtale", pages).page?.pageId).toBe("4");
    pages[1].likes = 100_000;
    const r = pickBrandPage("Foxtale", pages);
    expect(r.page).toBeNull();
    expect(r.reason).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
  });
  it("never takes an unverified page that merely contains the brand", () => {
    expect(pickBrandPage("Minimalist", [{ pageId: "6", label: "Minimalist Fans", verification: null }]).page).toBeNull();
  });
});
