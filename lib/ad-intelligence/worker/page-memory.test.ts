import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PageMemory, RECHECK_AFTER_MS, needsRecheck, pageMemoryPath, parsePageMemory } from "./page-memory";

describe("page memory", () => {
  it("ignores broken or foreign content", () => {
    expect(parsePageMemory("not json")).toEqual({});
    expect(parsePageMemory("[1,2]")).toEqual({});
    expect(parsePageMemory(JSON.stringify({ a: { pageId: "x1" }, b: { pageId: "123", name: "B" } }))).toEqual({
      b: { pageId: "123", name: "B", at: "", reason: "lead", checkedAt: "" },
    });
  });

  it("remembers, saves atomically and reloads", () => {
    const file = join(mkdtempSync(join(tmpdir(), "pm-")), "sub", "page-memory.json");
    const memory = new PageMemory(file);
    expect(memory.get("mamaearth")).toBeNull();
    memory.remember("mamaearth", { pageId: "619181354927737", name: "Mamaearth" });
    memory.remember("bad", { pageId: "not-a-number", name: "Bad" });
    memory.save();
    expect(JSON.parse(readFileSync(file, "utf8")).mamaearth.pageId).toBe("619181354927737");
    const again = new PageMemory(file);
    expect(again.get("mamaearth")?.pageId).toBe("619181354927737");
    expect(again.size).toBe(1);
  });

  it("uses LOCALAPPDATA on Windows", () => {
    expect(pageMemoryPath({ LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" })).toContain("zooptrack");
    expect(pageMemoryPath({ ADSPY_PAGE_MEMORY_FILE: "/x/y.json" })).toBe("/x/y.json");
  });

  it("old entries (no reason) are re-checked once, using their write time", () => {
    const now = Date.parse("2026-10-20T00:00:00Z");
    const parsed = parsePageMemory(
      JSON.stringify({
        fresh: { pageId: "1", name: "F", at: "2026-10-15T00:00:00Z" },
        old: { pageId: "2", name: "O", at: "2026-09-01T00:00:00Z" },
        none: { pageId: "3", name: "N" },
      }),
    );
    expect(parsed.fresh.reason).toBe("lead");
    expect(needsRecheck(parsed.fresh, now)).toBe(false);
    expect(needsRecheck(parsed.old, now)).toBe(true);
    expect(needsRecheck(parsed.none, now)).toBe(true);
  });

  it("exact matches never expire; non-exact expire after 14 days", () => {
    const now = Date.parse("2026-10-20T00:00:00Z");
    const old = new Date(now - RECHECK_AFTER_MS - 1000).toISOString();
    const recent = new Date(now - RECHECK_AFTER_MS + 60_000).toISOString();
    expect(needsRecheck({ pageId: "1", name: "a", at: old, reason: "exact", checkedAt: old }, now)).toBe(false);
    expect(needsRecheck({ pageId: "1", name: "a", at: old, reason: "verified", checkedAt: old }, now)).toBe(true);
    expect(needsRecheck({ pageId: "1", name: "a", at: old, reason: "lead", checkedAt: recent }, now)).toBe(false);
  });

  it("lookup flags a due re-check; remember refreshes checkedAt", () => {
    const file = join(mkdtempSync(join(tmpdir(), "pm-")), "page-memory.json");
    const memory = new PageMemory(file);
    const then = new Date("2026-09-01T00:00:00Z");
    memory.remember("plum", { pageId: "42", name: "Plum", reason: "lead" }, then);
    const later = Date.parse("2026-10-20T00:00:00Z");
    expect(memory.lookup("plum", later)?.recheck).toBe(true);
    memory.remember("plum", { pageId: "42", name: "Plum", reason: "lead" }, new Date(later));
    expect(memory.lookup("plum", later)?.recheck).toBe(false);
    expect(memory.get("plum")?.at).toBe(then.toISOString());
    memory.remember("mamaearth", { pageId: "7", name: "Mamaearth", reason: "exact" }, then);
    expect(memory.lookup("mamaearth", later)?.recheck).toBe(false);
    memory.save();
    expect(new PageMemory(file).get("mamaearth")?.reason).toBe("exact");
  });
});
