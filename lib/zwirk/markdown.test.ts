import { describe, expect, it } from "vitest";

import { parseInline, parseMarkdown, safeHref } from "./markdown";

describe("parseInline", () => {
  it("parses bold, italic, code and plain text", () => {
    expect(parseInline("Cut **CAC** by *10%* with `bundles` now")).toEqual([
      { type: "text", text: "Cut " },
      { type: "strong", children: [{ type: "text", text: "CAC" }] },
      { type: "text", text: " by " },
      { type: "em", children: [{ type: "text", text: "10%" }] },
      { type: "text", text: " with " },
      { type: "code", text: "bundles" },
      { type: "text", text: " now" },
    ]);
  });

  it("nests italic inside bold and handles underscore italics", () => {
    expect(parseInline("**big *push***")).toEqual([
      { type: "strong", children: [{ type: "text", text: "big " }, { type: "em", children: [{ type: "text", text: "push" }] }] },
    ]);
    expect(parseInline("_(Answer cut short)_")).toEqual([{ type: "em", children: [{ type: "text", text: "(Answer cut short)" }] }]);
    expect(parseInline("snake_case_word stays")).toEqual([{ type: "text", text: "snake_case_word stays" }]);
  });

  it("links only https urls", () => {
    expect(parseInline("see [Ad Library](https://www.facebook.com/ads/library)")).toEqual([
      { type: "text", text: "see " },
      { type: "link", href: "https://www.facebook.com/ads/library", children: [{ type: "text", text: "Ad Library" }] },
    ]);
    expect(parseInline("[x](http://insecure.example)")).toEqual([{ type: "text", text: "x" }]);
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("https://zooptrack.co.in/pricing")).toBe("https://zooptrack.co.in/pricing");
  });

  it("never turns javascript: links into links", () => {
    const tree = JSON.stringify(parseInline("[click](javascript:alert(1)) and [y](data:text/html,hi)"));
    expect(tree).not.toContain('"link"');
  });

  it("leaves unmatched markers as text", () => {
    expect(parseInline("2 * 3 = 6 and **open")).toEqual([{ type: "text", text: "2 * 3 = 6 and **open" }]);
  });
});

describe("parseMarkdown", () => {
  it("builds headings, paragraphs with breaks, and lists", () => {
    const tree = parseMarkdown("### Summary\n- One\n- **Two**\n\nLine a\nLine b\n\n1. First\n2. Second");
    expect(tree).toEqual([
      { type: "heading", level: 3, children: [{ type: "text", text: "Summary" }] },
      {
        type: "list",
        ordered: false,
        start: 1,
        items: [[{ type: "text", text: "One" }], [{ type: "strong", children: [{ type: "text", text: "Two" }] }]],
      },
      { type: "paragraph", children: [{ type: "text", text: "Line a" }, { type: "break" }, { type: "text", text: "Line b" }] },
      { type: "list", ordered: true, start: 1, items: [[{ type: "text", text: "First" }], [{ type: "text", text: "Second" }]] },
    ]);
  });

  it("keeps ordered list numbering and indented continuation lines", () => {
    const tree = parseMarkdown("3. Third\n   more detail\nAfter");
    expect(tree).toEqual([
      { type: "list", ordered: true, start: 3, items: [[{ type: "text", text: "Third" }, { type: "break" }, { type: "text", text: "more detail" }]] },
      { type: "paragraph", children: [{ type: "text", text: "After" }] },
    ]);
  });

  it("caps heading depth at 3, reads code fences and ignores rules", () => {
    expect(parseMarkdown("#### Deep\n---\n```\n<b>x</b>\n```")).toEqual([
      { type: "heading", level: 3, children: [{ type: "text", text: "Deep" }] },
      { type: "codeblock", text: "<b>x</b>" },
    ]);
  });

  it("keeps raw HTML as text", () => {
    expect(parseMarkdown("<script>alert(1)</script>")).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "<script>alert(1)</script>" }] },
    ]);
  });

  it("handles empty input", () => {
    expect(parseMarkdown("")).toEqual([]);
  });
});
