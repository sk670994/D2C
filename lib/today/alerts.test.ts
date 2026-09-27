import { describe, expect, it } from "vitest";

import type { Move } from "./insights";
import { alertKey, alertsToSend, alertSubject, isoWeek } from "./alerts";

const move = (kind: Move["kind"], pageId: string, brand: string): Move => ({ kind, label: "", pageId, brand, title: "", detail: "", action: "", score: 1, evidence: [] });

describe("rival alerts", () => {
  it("labels ISO weeks", () => {
    expect(isoWeek(new Date("2026-09-28T10:00:00Z"))).toBe("2026-W40");
    expect(isoWeek(new Date("2027-01-01T10:00:00Z"))).toBe("2026-W53");
  });
  it("sends only new big moves", () => {
    const week = "2026-W40";
    const moves = [move("big", "1", "A"), move("staying", "2", "B"), move("big", "3", "C")];
    const sent = new Set([alertKey(moves[0], week)]);
    expect(alertsToSend(moves, sent, week).map((m) => m.brand)).toEqual(["C"]);
  });
  it("writes a clear subject", () => {
    expect(alertSubject([move("big", "1", "Glowleaf")])).toBe("Glowleaf just made a big move");
    expect(alertSubject([move("big", "1", "A"), move("big", "2", "B")])).toBe("2 rivals made big moves: A, B");
  });
});
