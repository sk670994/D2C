import { describe, expect, it } from "vitest";

import { extractAdvertiserIdentity } from "./parser";

describe("extractAdvertiserIdentity: 'x' collaborations", () => {
  it("does not split brand names that contain the letter x", () => {
    for (const name of ["Foxtale", "TATA CLiQ Luxury", "American Express", "Avian Experiences"]) {
      const parsed = extractAdvertiserIdentity([name, "Sponsored"]);
      expect(parsed.advertiserName).toBe(name);
      expect(parsed.creatorName ?? null).toBeNull();
    }
  });
  it("still splits a real 'Brand x Creator' line", () => {
    const parsed = extractAdvertiserIdentity(["Nykaa x kritika_k", "Sponsored"]);
    expect(parsed.advertiserName).toBe("Nykaa");
    expect(parsed.creatorName).toBe("kritika_k");
  });
});
