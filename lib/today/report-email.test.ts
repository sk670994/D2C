import { describe, expect, it } from "vitest";

import { escapeHtml, renderReportEmail, reportSubject } from "./report-email";
import type { Move } from "./insights";

const move: Move = {
  kind: "big",
  label: "Big move",
  pageId: "619181354927737",
  brand: "Mamaearth",
  title: "79 new ads in 7 days, led by “Up to 35% OFF”.",
  detail: "226 launched in 30 days.",
  action: "Brief it this week.",
  score: 179,
  evidence: [],
};

describe("report email", () => {
  it("escapes everything that came from ads", () => {
    expect(escapeHtml(`<img src=x onerror="a">&'`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
    const html = renderReportEmail({
      headline: "<script>x</script>",
      moves: [{ ...move, brand: "<b>Evil</b>" }],
      rivals: [{ pageId: "1", name: "A&B", new7: 3, total: 9 }],
      appUrl: "https://www.zooptrack.co.in/",
      dateLabel: "Monday · 28 Sep",
    });
    expect(html.includes("<script>x</script>")).toBe(false);
    expect(html.includes("&lt;b&gt;Evil&lt;/b&gt;")).toBe(true);
    expect(html.includes("https://www.zooptrack.co.in/today/brand/619181354927737")).toBe(true);
    expect(html.includes("A&amp;B")).toBe(true);
  });

  it("writes a subject from the top move", () => {
    expect(reportSubject({ headline: "", moves: [move, move] })).toBe("Mamaearth: 79 new ads in 7 days, led by “Up to 35% OFF” (and 1 more move)");
    expect(reportSubject({ headline: "", moves: [] })).toBe("Your Monday rival report");
  });
});
