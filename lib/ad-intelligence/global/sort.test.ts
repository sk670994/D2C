import { describe, expect, it } from "vitest";

import { parseAdSort } from "./sort";
import { SORT_OPTIONS } from "@/components/dashboard/adspy/workspace-utils";

describe("parseAdSort", () => {
  it("accepts only whitelisted keys", () => {
    expect(parseAdSort("newest")).toBe("newest");
    expect(parseAdSort(" LONGEST ")).toBe("longest");
    expect(parseAdSort("stopped")).toBe("stopped");
    expect(parseAdSort("first_seen_at; drop table x")).toBe("relevant");
    expect(parseAdSort(null)).toBe("relevant");
  });
  it("UI options match the API whitelist", () => {
    for (const [value] of SORT_OPTIONS) expect(parseAdSort(value)).toBe(value);
  });
});
