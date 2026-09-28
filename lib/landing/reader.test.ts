import { expect, it } from "vitest";

import { extractPrices, isMismatch, landingKey, offersOverlap, pageFacts } from "./reader";

it("keys landing pages without tracking parameters and skips social links", () => {
  expect(landingKey("https://www.Mamaearth.in/product/scrub/?utm_source=fb&fbclid=1")).toBe("mamaearth.in/product/scrub");
  expect(landingKey("https://mamaearth.in")).toBe("mamaearth.in/");
  expect(landingKey("https://www.facebook.com/mamaearth")).toBeNull();
  expect(landingKey("https://wa.me/9199")).toBeNull();
  expect(landingKey("not a url")).toBeNull();
});

it("finds rupee prices", () => {
  expect(extractPrices("MRP ₹599 now Rs. 449 | INR 1,299.00 and ₹ 5 and 20% off")).toEqual([449, 599, 1299]);
});

it("reads page facts from markdown", () => {
  const facts = pageFacts("# Scrub\n![img](https://x/y.jpg) Buy 2 Get 1 free on all scrubs. [Shop](https://x) Price ₹349", "Foam Scrub");
  expect(facts.title).toBe("Foam Scrub");
  expect(facts.prices).toEqual([349]);
  expect(facts.offers.includes("bogo")).toBe(true);
  expect(facts.excerpt.includes("y.jpg")).toBe(false);
});

it("compares offer types", () => {
  expect(offersOverlap([], ["bogo"])).toBeNull();
  expect(offersOverlap(["percent_off"], [])).toBe(false);
  expect(offersOverlap(["percent_off"], ["bogo", "percent_off"])).toBe(true);
  expect(offersOverlap(["percent_off"], ["bogo"])).toBe(false);
});

it("flags a mismatch from Jev first, offer types otherwise", () => {
  expect(isMismatch({ offers_overlap: true, jev_match: 0.1 })).toBe(true);
  expect(isMismatch({ offers_overlap: false, jev_match: 0.9 })).toBe(false);
  expect(isMismatch({ offers_overlap: false, jev_match: null })).toBe(true);
  expect(isMismatch({ offers_overlap: null, jev_match: null })).toBe(false);
});
