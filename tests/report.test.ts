import { describe, expect, it } from "vitest";
import { calculateReport } from "@/lib/calc/report";
import { DEFAULT_REPORT_INPUT } from "@/lib/constants/defaultInput";
import { recommendationFromAction } from "@/lib/decision/recommendation";
import { compareCompetitiveSnapshots } from "@/lib/competitive/radar";

function calculate(overrides: Partial<typeof DEFAULT_REPORT_INPUT["unitEconomicsInput"]>) {
  return calculateReport({
    ...DEFAULT_REPORT_INPUT,
    unitEconomicsInput: {
      ...DEFAULT_REPORT_INPUT.unitEconomicsInput,
      ...overrides,
    },
  });
}

describe("canonical economics", () => {
  it("exposes CM1, CM2 and CM3 in order", () => {
    const report = calculate({});

    expect(report.unitEconomics.contributionLayers.cm1).toBeGreaterThanOrEqual(
      report.unitEconomics.contributionLayers.cm2,
    );
    expect(report.unitEconomics.contributionLayers.cm3).toBe(
      report.unitEconomics.contributionLayers.cm2 - report.adMetrics.blendedCac,
    );
  });

  it("shows positive monthly impact when returns fall by one point", () => {
    const report = calculate({});

    expect(
      report.unitEconomics.impactScenarios.returnsRateMinusOnePoint.monthly,
    ).toBeGreaterThan(0);
  });

  it("reduces CM2 when COGS increases", () => {
    const baseline = calculate({});
    const higherCogs = calculate({ cogsParts: [500, 0, 0, 0] });

    expect(higherCogs.unitEconomics.contributionLayers.cm2).toBeLessThan(
      baseline.unitEconomics.contributionLayers.cm2,
    );
  });

  it("creates an expiring structured recommendation from a decision", () => {
    const recommendation = recommendationFromAction({
      priority: "high",
      category: "test-new-angle",
      title: "Test a new creative angle",
      description: "Launch three differentiated concepts.",
      expectedImpact: "Protect contribution while improving CAC.",
    });

    expect(recommendation.decision).toBe("TEST");
    expect(recommendation.confidence).toBe("medium");
    expect(new Date(recommendation.expiresAt).getTime()).toBeGreaterThan(
      new Date(recommendation.createdAt).getTime(),
    );
  });

  it("detects competitive creative, offer and hook changes", () => {
    const radar = compareCompetitiveSnapshots(
      [
        { id: "old", offer: "20% off", headline: "Better skin", creativeType: "image" },
        { id: "same", offer: "Bundle", headline: "Shop now", creativeType: "image" },
      ],
      [
        { id: "new", offer: "Free shipping", primaryText: "Dermatologist tested", creativeType: "video" },
        { id: "same", offer: "Bundle", headline: "Shop now", creativeType: "image" },
      ],
    );

    expect(radar.newAds.map((ad) => ad.id)).toEqual(["new"]);
    expect(radar.removedAds.map((ad) => ad.id)).toEqual(["old"]);
    expect(radar.newOffers).toContain("free shipping");
    expect(radar.removedOffers).toContain("20% off");
    expect(radar.newHooks).toContain("dermatologist tested");
    expect(radar.removedHooks).toContain("better skin");
    expect(radar.formatMixChange.video).toBe(1);
  });
});
