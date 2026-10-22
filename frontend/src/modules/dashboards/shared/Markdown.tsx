import { Fragment, type ReactNode } from "react";

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
const LINK_PATTERN = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const SAFE_HREF_PATTERN = /^(https?:|\/|#)/;

/** Inline markup: bold, italic, code and links. Only http(s), relative and anchor links are kept. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = new RegExp(INLINE_PATTERN);
  let last = 0;
  let counter = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${counter++}`;
    if (token.startsWith("**")) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) out.push(renderLink(token, key));
    else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderLink(token: string, key: string): ReactNode {
  const parts = LINK_PATTERN.exec(token);
  const href = parts?.[2] ?? "#";
  const safeHref = SAFE_HREF_PATTERN.test(href) ? href : "#";
  return (
    <a
      key={key}
      href={safeHref}
      target={safeHref.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
    >
      {parts?.[1]}
    </a>
  );
}

/** Minimal safe markdown (no HTML): headings, lists, bold, italic, code and links. */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length) {
      const items = listItems;
      blocks.push(
        <ul key={`ul${blocks.length}`}>
          {items.map((item, index) => (
            <li key={index}>{renderInline(item, `li${blocks.length}-${index}`)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  };
  lines.forEach((line, index) => {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const listItem = /^\s*[-*]\s+(.*)$/.exec(line);
    if (listItem) {
      listItems.push(listItem[1]);
      return;
    }
    flushList();
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], `h${index}`);
      blocks.push(renderHeading(level, index, content));
    } else if (line.trim()) blocks.push(<p key={index}>{renderInline(line, `p${index}`)}</p>);
    else blocks.push(<Fragment key={index} />);
  });
  flushList();
  return <div className="markdown">{blocks}</div>;
}

function renderHeading(level: number, key: number, content: ReactNode[]): ReactNode {
  if (level === 1) return <h1 key={key}>{content}</h1>;
  if (level === 2) return <h2 key={key}>{content}</h2>;
  return <h3 key={key}>{content}</h3>;
}
