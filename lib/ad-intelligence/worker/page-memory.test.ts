import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PageMemory, pageMemoryPath, parsePageMemory } from "./page-memory";

describe("page memory", () => {
  it("ignores broken or foreign content", () => {
    expect(parsePageMemory("not json")).toEqual({});
    expect(parsePageMemory("[1,2]")).toEqual({});
    expect(parsePageMemory(JSON.stringify({ a: { pageId: "x1" }, b: { pageId: "123", name: "B" } }))).toEqual({
      b: { pageId: "123", name: "B", at: "" },
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
});
