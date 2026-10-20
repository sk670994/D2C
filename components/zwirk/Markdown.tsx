import { Fragment, type ReactNode } from "react";

import { parseMarkdown, type MdBlock, type MdInline } from "@/lib/zwirk/markdown";

/**
 * Safe markdown for ZWIRK replies: the reply is parsed into a token tree
 * (lib/zwirk/markdown.ts) and rendered as plain React elements. No
 * dangerouslySetInnerHTML; React escapes all text; links are https only.
 */
function renderInline(nodes: MdInline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case "text":
        return <Fragment key={key}>{node.text}</Fragment>;
      case "strong":
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
      case "em":
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case "code":
        return <code key={key}>{node.text}</code>;
      case "link":
        return (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer nofollow">
            {renderInline(node.children, key)}
          </a>
        );
      case "break":
        return <br key={key} />;
      default:
        return null;
    }
  });
}

function renderBlock(block: MdBlock, i: number): ReactNode {
  const key = `b${i}`;
  switch (block.type) {
    case "heading": {
      const children = renderInline(block.children, key);
      if (block.level === 1) return <h3 key={key}>{children}</h3>;
      if (block.level === 2) return <h4 key={key}>{children}</h4>;
      return <h5 key={key}>{children}</h5>;
    }
    case "paragraph":
      return <p key={key}>{renderInline(block.children, key)}</p>;
    case "list": {
      const items = block.items.map((item, j) => <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>);
      return block.ordered ? (
        <ol key={key} start={block.start === 1 ? undefined : block.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case "codeblock":
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      );
    default:
      return null;
  }
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text);
  return <div className={className ? `zw-md ${className}` : "zw-md"}>{blocks.map(renderBlock)}</div>;
}
