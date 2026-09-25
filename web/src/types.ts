/**
 * types.ts - the events the API streams from POST /api/ask.
 * These mirror AnswerEvent in the server's src/answer.ts; keep the two in sync.
 */

export interface SourceInfo {
  number: number;
  title: string;
  date: string;
  section: string;
  url: string;
  stadium: boolean;
  text: string;
}

export type AnswerEvent =
  | { type: "meta"; question: string; filterNote: string; model: string; summary: boolean; sources: SourceInfo[] }
  | { type: "direct"; text: string }
  | { type: "thinking" }
  | { type: "retry"; thinkingChars: number }
  | { type: "token"; text: string }
  | { type: "done"; cited: number[] }
  | { type: "empty"; doneReason: string }
  | { type: "error"; message: string };

export interface PatchInfo {
  date: string;
  title: string;
  url: string;
}
