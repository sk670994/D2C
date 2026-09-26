import { describe, expect, it } from "vitest";

import {
  calculateBreakEven,
  classifyOffer,
  discountDepth,
  firstSentence,
  hookKey,
  normalizeEconomics,
  parseRupees,
  pickPageForName,
  productKey,
  runningDays,
} from "./signals";

describe("hooks", () => {
  it("takes the first sentence and groups by meaning, not punctuation", () => {
    expect(firstSentence("Dermat ne bola tha, yeh try karo! Shop now https://x.co")).toBe("Dermat ne bola tha, yeh try karo!");
    expect(hookKey("POV: your skin at 30 ✨")).toBe(hookKey("pov your skin at 30"));
  });
});

describe("productKey", () => {
  it("uses the landing product/collection path, then the product name", () => {
    expect(productKey("https://www.brand.in/products/vitamin-c-serum?utm_source=fb", null)).toBe("/products/vitamin-c-serum");
    expect(productKey("https://brand.in/collections/sunscreen/", null)).toBe("/collections/sunscreen");
    expect(productKey("https://brand.in/", "Rice Face Wash")).toBe("Rice Face Wash");
    expect(productKey("https://brand.in/", null)).toBeNull();
  });
});

describe("offers", () => {
  it("classifies Indian D2C offer types", () => {
    expect(classifyOffer("Buy 2 Get 1 on sunscreen")).toEqual(["bogo"]);
    expect(classifyOffer("Flat 30% off till midnight")).toEqual(["percent_off"]);
    expect(classifyOffer("Free comb with every order + 10% prepaid discount")).toEqual(["free_gift", "prepaid"]);
    expect(classifyOffer("Use code GLOW20")).toEqual(["code"]);
    expect(classifyOffer("Big sale")).toEqual(["sale"]);
    expect(classifyOffer("")).toEqual([]);
  });
  it("reads depth and rupee prices", () => {
    expect(discountDepth("Up to 40% off, extra 10%")).toBe(40);
    expect(parseRupees("Now ₹1,299 only")).toBe(1299);
    expect(parseRupees("Rs. 399")).toBe(399);
    expect(parseRupees("no price")).toBeNull();
  });
});

describe("economics", () => {
  it("computes break-even from costs and fee rates", () => {
    const e = normalizeEconomics({ cogs: 200, packagingCost: 20, shippingCost: 60, paymentFeePercent: 2, rtoRatePercent: 20, rtoCost: 100, sellingPrice: 599 });
    const r = calculateBreakEven(e);
    // fixed = 200 + 20 + 60 + 100*20% = 300; fee 2% -> 300 / 0.98
    expect(r.breakEvenPrice).toBe(306.12);
    expect(r.contributionBeforeAds).toBe(287.02);
  });
  it("returns nulls instead of ₹0 when no costs are set", () => {
    expect(calculateBreakEven(normalizeEconomics({})).breakEvenPrice).toBeNull();
  });
  it("drops negative, non-numeric and out-of-range inputs", () => {
    const e = normalizeEconomics({ cogs: -5, shippingCost: "abc", paymentFeePercent: 250, packagingCost: "12" });
    expect(e.cogs).toBeNull();
    expect(e.shippingCost).toBeNull();
    expect(e.paymentFeePercent).toBe(100);
    expect(e.packagingCost).toBe(12);
  });
});

describe("pickPageForName (Page ID is authoritative)", () => {
  const rows = [
    { page_id: "1", label: "Nykaa" },
    { page_id: "2", label: "Nykaa Fashion" },
    { page_id: "3", label: "Plum Goodness" },
    { page_id: "4", label: "Foxtale" },
  ];
  it("prefers an exact match", () => expect(pickPageForName("nykaa", rows)).toBe("1"));
  it("accepts a single unambiguous prefix", () => expect(pickPageForName("Plum", rows)).toBe("3"));
  it("refuses ambiguous prefixes", () => expect(pickPageForName("Nyk", rows)).toBeNull());
  it("never matches a longer query to a shorter page", () => expect(pickPageForName("Foxtale Serum Co", rows)).toBeNull());
});

describe("runningDays", () => {
  it("counts observed days inclusively and never negative", () => {
    expect(runningDays("2026-09-01T00:00:00Z", "2026-09-10T00:00:00Z")).toBe(10);
    expect(runningDays("2026-09-10T00:00:00Z", "2026-09-01T00:00:00Z")).toBe(1);
    expect(runningDays(null, null)).toBe(0);
  });
});
