import { describe, expect, test } from "bun:test";

import { queryFor, resolveBrandPages, resolveBrandPagesFrom, seedBrandFor, type BrandPageCandidate } from "./resolve-brand-pages";

const pins = { Kapiva: ["111", "222", "333"], Acme: ["900"] };
const overrides = { glowco: { pageId: "500", name: "Glow Co Official" } };
const c = (pageId: string, label: string, extra: Partial<BrandPageCandidate> = {}): BrandPageCandidate => ({ pageId, label, verification: null, ...extra });

describe("resolveBrandPagesFrom ordering", () => {
  test("seed pins win over overrides and candidates, and keep every pinned page", () => {
    const r = resolveBrandPagesFrom("kapiva", [c("999", "Kapiva", { verification: "VERIFIED" })], { pins, overrides });
    expect(r).toEqual({ primaryPageId: "111", pageIds: ["111", "222", "333"], name: "Kapiva", source: "pin" });
  });
  test("overrides come next", () => {
    const r = resolveBrandPagesFrom("Glow Co", [c("1", "Glow Co", { verification: "VERIFIED" })], { pins, overrides });
    expect(r?.primaryPageId).toBe("500");
    expect(r?.source).toBe("override");
  });
  test("then pickBrandPage over candidates (verified exact page)", () => {
    const r = resolveBrandPagesFrom("Foxtale", [c("4", "Foxtale", { verification: "VERIFIED" }), c("5", "Foxtale Fans")], { pins, overrides });
    expect(r).toEqual({ primaryPageId: "4", pageIds: ["4"], name: "Foxtale", source: "pick" });
  });
  test("falls back to the older ranked prefix match when pickBrandPage declines", () => {
    // Unverified prefix match: pickBrandPage is strict, the old ranking accepts it.
    const r = resolveBrandPagesFrom("Deconstructx", [c("7", "Deconstructx Skincare")], { pins: {}, overrides: {} });
    expect(r?.primaryPageId).toBe("7");
    expect(r?.source).toBe("ranked");
  });
  test("no candidates and no pin -> null", () => {
    expect(resolveBrandPagesFrom("Nobody Brand", [], { pins, overrides })).toBeNull();
  });
});

describe("seed helpers", () => {
  test("slug and name both find the seed brand", () => {
    expect(seedBrandFor("dot-and-key")).toBe("Dot & Key");
    expect(seedBrandFor("Dot & Key")).toBe("Dot & Key");
    expect(seedBrandFor("not-a-real-brand-xyz")).toBeNull();
    expect(queryFor("not-a-real-brand-xyz")).toBe("not a real brand xyz");
  });
  test("real seed pins resolve without a look-up", async () => {
    const r = await resolveBrandPages("kapiva", { fetchCandidates: async () => { throw new Error("should not be called"); } });
    expect(r?.pageIds.length).toBeGreaterThan(1);
    expect(r?.source).toBe("pin");
  });
  test("look-up errors propagate (no cached empty page)", async () => {
    await expect(resolveBrandPages("not-a-real-brand-xyz", { fetchCandidates: async () => { throw new Error("db down"); } })).rejects.toThrow("db down");
  });
});
