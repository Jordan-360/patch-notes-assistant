/**
 * RichText - renders the model's answer: headings, bullets, **bold**,
 * clickable [1] citations, and (buff)/(nerf) tags as colored markers.
 *
 * It builds React elements instead of injecting HTML, so nothing the model
 * writes can run as code in the page.
 */

import type { ReactNode } from "react";

interface Props {
  text: string;
  validCitations: Set<number>;
  onCite?: (number: number) => void;
}

const INLINE = /(\*\*[^*\n]+\*\*|\[\d+\]|\((?:buff|nerf)\))/gi;

export function ChangeTag({ kind }: { kind: "buff" | "nerf" }) {
  return (
    <span className={`tag tag--${kind}`}>
      <span aria-hidden="true">{kind === "buff" ? "▲" : "▼"}</span> {kind === "buff" ? "Buff" : "Nerf"}
    </span>
  );
}

function renderInline(text: string, props: Props, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{renderInline(part.slice(2, -2), props, key)}</strong>;
    }
    const citation = part.match(/^\[(\d+)\]$/);
    if (citation) {
      const number = Number(citation[1]);
      if (!props.validCitations.has(number) || !props.onCite) return <sup key={key}>{part}</sup>;
      return (
        <button
          key={key}
          type="button"
          className="cite"
          onClick={() => props.onCite?.(number)}
          aria-label={`Show source ${number}`}
        >
          {number}
        </button>
      );
    }
    const tag = part.match(/^\((buff|nerf)\)$/i);
    if (tag) return <ChangeTag key={key} kind={tag[1].toLowerCase() as "buff" | "nerf"} />;
    return part;
  });
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "paragraph"; text: string };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const bullet = line.match(/^[*\-•]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/) ?? line.match(/^\*\*([^*]+)\*\*(\s*\[\d+\])*:?$/);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list") last.items.push(bullet[1]);
      else blocks.push({ kind: "list", items: [bullet[1]] });
    } else if (heading) {
      blocks.push({ kind: "heading", text: heading[1] });
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }
  return blocks;
}

export function RichText(props: Props) {
  return (
    <>
      {toBlocks(props.text).map((block, i) => {
        const key = `b${i}`;
        if (block.kind === "heading") return <h3 key={key}>{renderInline(block.text, props, key)}</h3>;
        if (block.kind === "list") {
          return (
            <ul key={key}>
              {block.items.map((item, j) => (
                <li key={`${key}-${j}`}>{renderInline(item, props, `${key}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={key}>{renderInline(block.text, props, key)}</p>;
      })}
    </>
  );
}
