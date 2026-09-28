import { expect, it } from "vitest";

import { containmentFilter, hasFilters, parseFinderQuery } from "./finder";

it("keeps only taxonomy values and safe ids", () => {
  const q = parseFinderQuery(new URLSearchParams("hookType=offer&language=Hinglish&angle=drop table&offer=1&pageId=619181354927737&limit=500&scope=watched"));
  expect(q.labels).toEqual({ hookType: "offer", language: "hinglish" });
  expect(q.offer).toBe(true);
  expect(q.pageId).toBe("619181354927737");
  expect(q.limit).toBe(60);
  expect(q.watchedOnly).toBe(true);
  expect(containmentFilter(q)).toEqual({ hookType: "offer", language: "hinglish", offerPresent: true });
  expect(hasFilters(q)).toBe(true);
});

it("treats an empty query as no filters", () => {
  const q = parseFinderQuery(new URLSearchParams("pageId=abc"));
  expect(q.pageId).toBeNull();
  expect(q.limit).toBe(24);
  expect(hasFilters(q)).toBe(false);
});
