/**
 * SourceList - the patch-note excerpts an answer is based on.
 * Each one expands to show the original text, with buff/nerf tags marked.
 */

import { formatPatchDate } from "../questions";
import type { SourceInfo } from "../types";
import { RichText } from "./RichText";

interface Props {
  sources: SourceInfo[];
  openSource: number | null;
  onToggle: (number: number, open: boolean) => void;
}

export function SourceList({ sources, openSource, onToggle }: Props) {
  if (sources.length === 0) return null;
  return (
    <section className="sources" aria-labelledby="sources-heading">
      <h2 id="sources-heading">Sources</h2>
      <ol>
        {sources.map((source) => (
          <li key={source.number}>
            <details
              id={`source-${source.number}`}
              open={openSource === source.number}
              onToggle={(e) => onToggle(source.number, (e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>
                <span className="source-number">{source.number}</span>
                <span className="source-title">
                  {source.section}
                  {source.stadium && <span className="stadium-note">Stadium only</span>}
                </span>
                <span className="source-date">{formatPatchDate(source.date, true)}</span>
              </summary>
              <div className="source-body">
                <RichText text={source.text} validCitations={new Set()} />
                <a href={source.url} target="_blank" rel="noreferrer">
                  Open the official {formatPatchDate(source.date)} patch notes
                </a>
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
