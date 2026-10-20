/**
 * A tiny markdown parser for ZWIRK replies. Pure: returns a token tree that
 * components/zwirk/Markdown.tsx turns into React elements (React escapes all
 * text, and no HTML from the model is ever interpreted). Unit tested in
 * markdown.test.ts.
 *
 * Supported: paragraphs with line breaks, # to ### headings, "-", "*" and
 * "1." lists, ``` code blocks, **bold**, *italic* / _italic_, `code`, and
 * [text](https://...) links. Anything else stays plain text.
 */

export type MdInline =
  | { type: "text"; text: string }
  | { type: "strong"; children: MdInline[] }
  | { type: "em"; children: MdInline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: MdInline[] }
  | { type: "break" };

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; children: MdInline[] }
  | { type: "paragraph"; children: MdInline[] }
  | { type: "list"; ordered: boolean; start: number; items: MdInline[][] }
  | { type: "codeblock"; text: string };

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,4})[.)]\s+(.*)$/;
const FENCE = /^\s*```/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Only absolute https links become clickable. */
export function safeHref(url: string): string | null {
  const value = url.trim();
  return /^https:\/\/[^\s<>"']+$/i.test(value) ? value : null;
}

type InlineRule = { re: RegExp; build: (m: RegExpExecArray) => MdInline };

const INLINE_RULES: InlineRule[] = [
  { re: /`([^`]+)`/, build: (m) => ({ type: "code", text: m[1] }) },
  {
    re: /\[([^\]]+)\]\(([^()\s]+)\)/,
    build: (m) => {
      const href = safeHref(m[2]);
      // Unsafe or relative links keep only their text.
      return href ? { type: "link", href, children: parseInline(m[1]) } : { type: "text", text: m[1] };
    },
  },
  { re: /\*\*(?=\S)(.*?\S)\*\*(?!\*)/, build: (m) => ({ type: "strong", children: parseInline(m[1]) }) },
  { re: /__(?=\S)(.*?\S)__/, build: (m) => ({ type: "strong", children: parseInline(m[1]) }) },
  { re: /\*(?=[^\s*])([^*]*?[^\s*])\*/, build: (m) => ({ type: "em", children: parseInline(m[1]) }) },
  { re: /(?<![\w])_(?=[^\s_])([^_]*?[^\s_])_(?![\w])/, build: (m) => ({ type: "em", children: parseInline(m[1]) }) },
];

function pushText(out: MdInline[], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === "text") last.text += text;
  else out.push({ type: "text", text });
}

/** Inline markup within one line. */
export function parseInline(line: string): MdInline[] {
  const out: MdInline[] = [];
  let rest = line;
  while (rest) {
    let best: { index: number; length: number; node: MdInline } | null = null;
    for (const rule of INLINE_RULES) {
      const m = rule.re.exec(rest);
      if (m && (!best || m.index < best.index)) best = { index: m.index, length: m[0].length, node: rule.build(m) };
    }
    if (!best) {
      pushText(out, rest);
      break;
    }
    pushText(out, rest.slice(0, best.index));
    if (best.node.type === "text") pushText(out, best.node.text);
    else out.push(best.node);
    rest = rest.slice(best.index + best.length);
  }
  return out;
}

function joinLines(lines: string[]): MdInline[] {
  const out: MdInline[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push({ type: "break" });
    out.push(...parseInline(line.trim()));
  });
  return out;
}

/** Whole reply -> blocks. */
export function parseMarkdown(source: string): MdBlock[] {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; start: number; items: string[][] } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: "paragraph", children: joinLines(para) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ordered: list.ordered, start: list.start, items: list.items.map(joinLines) });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE.test(line)) {
      flushPara();
      flushList();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      blocks.push({ type: "codeblock", text: body.join("\n") });
      continue;
    }

    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }

    if (HR.test(line)) {
      flushPara();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, children: parseInline(heading[2]) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flushPara();
      const isOrdered = Boolean(ordered);
      const text = bullet ? bullet[1] : ordered![2];
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, start: ordered ? Number(ordered[1]) || 1 : 1, items: [] };
      }
      list.items.push([text]);
      continue;
    }

    // An indented line right after a list item continues that item.
    if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1].push(line);
      continue;
    }

    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}
