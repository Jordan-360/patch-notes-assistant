/**
 * answer.ts - the full RAG loop, shared by the terminal (ask.ts) and the web server (server.ts).
 *
 * 1. Retrieve the relevant patch-note chunks
 * 2. Have a language model write an answer using only those chunks
 * 3. Report which sources the answer cited
 *
 * Instead of printing, it reports progress as "events" (sources found, a piece of the answer,
 * done...). The terminal prints them; the server streams them to the browser.
 */

import type { IndexedChunk } from "./ingest.js";
import { CHAT_MODEL, chatStream, type ChatMessage } from "./ollama.js";
import { labelChanges } from "./labels.js";
import { retrieve, type Result } from "./retrieve.js";

const TOP_K = 6;          // how many chunks the model gets to read for a normal question
const SUMMARY_TOP_K = 15; // summaries need every matching chunk, not just the closest few
const MIN_SCORE = 0.45;   // chunks less similar than this are too off-topic to include

/** Questions like "Summarize this patch for tanks" or "all changes to supports" want everything. */
const SUMMARY_QUESTION = /\b(summari[sz]e|summary|overview|all (the )?changes|everything|recap|tl;?dr)\b/i;

const SYSTEM_PROMPT = `You are a patch notes assistant for the game Overwatch.
Answer the player's question using ONLY the numbered sources provided.

Rules:
- Every claim must end with the number of the source it came from, like [1] or [2][3].
- Never use outside knowledge about Overwatch, even if you think you know the answer.
- If the sources don't answer the question, say "The patch notes I have don't cover that." and stop.
- Include exact numbers (cooldowns, damage, percentages) when the sources give them.
- Some lines end with a (buff) or (nerf) tag. Those tags are already correct: copy them exactly. Never add a buff or nerf label to a line without a tag.
- If a source is marked "Stadium mode only", say that the change only applies in Stadium.
- If a source is a bug fix, call it a bug fix, not a buff or nerf.
- If the sources come from more than one patch, group the bullets by patch, newest patch first, with the patch date as a short heading. If they all come from one patch, don't add a patch heading.
- Keep it short and easy to skim: a one-sentence summary first, then bullet points.`;

/** A source as the terminal or browser sees it. */
export interface SourceInfo {
  number: number;         // the [1], [2]... the answer cites
  title: string;
  date: string;
  section: string;
  url: string;
  stadium: boolean;
  text: string;           // the patch-note text itself, so the UI can show it
}

export type AnswerEvent =
  | { type: "meta"; question: string; filterNote: string; model: string; summary: boolean; sources: SourceInfo[] }
  | { type: "direct"; text: string }           // answered straight from the data, no model needed
  | { type: "thinking" }                        // the model is reasoning before it answers
  | { type: "retry"; thinkingChars: number }    // thinking ran out of room, retrying without it
  | { type: "token"; text: string }             // the next piece of the answer
  | { type: "done"; cited: number[] }           // finished; which source numbers were cited
  | { type: "empty"; doneReason: string };      // the model gave no answer

/** Formats the retrieved chunks as numbered sources for the model to read. */
function formatSources(results: Result[]): string {
  return results
    .map(({ chunk }, i) => {
      const stadium = chunk.mode === "stadium" ? " (Stadium mode only)" : "";
      return `[${i + 1}] ${chunk.patch.title} - ${chunk.section}${stadium}\n${labelChanges(chunk.text)}`;
    })
    .join("\n\n");
}

export async function answerQuestion(
  question: string,
  chunks: IndexedChunk[],
  emit: (event: AnswerEvent) => void,
): Promise<void> {
  // 1. Retrieve: find the most relevant chunks
  const isSummary = SUMMARY_QUESTION.test(question);
  const { results: ranked, filterNote, heroesWithNoChanges, target } = await retrieve(
    question,
    chunks,
    isSummary ? SUMMARY_TOP_K : TOP_K,
  );
  // Summaries keep every filtered chunk (newest patch first, then patch-notes order);
  // normal questions keep only chunks that are close enough in meaning
  const results = isSummary
    ? [...ranked].sort(
        (a, b) =>
          b.chunk.patch.date.localeCompare(a.chunk.patch.date) ||
          chunks.indexOf(a.chunk) - chunks.indexOf(b.chunk),
      )
    : ranked.filter((r) => r.score >= MIN_SCORE);

  const sources: SourceInfo[] = results.map(({ chunk }, i) => ({
    number: i + 1,
    title: chunk.patch.title,
    date: chunk.patch.date,
    section: chunk.section,
    url: chunk.patch.url,
    stadium: chunk.mode === "stadium",
    text: labelChanges(chunk.text),
  }));
  emit({ type: "meta", question, filterNote, model: CHAT_MODEL, summary: isSummary, sources });

  // Questions the data can answer directly, with no model needed
  if (target.notFound) {
    emit({ type: "direct", text: `I don't have ${target.label} in my patch notes yet.` });
    return;
  }
  if (heroesWithNoChanges.length > 0) {
    const where = /\bstadium\b/i.test(question) ? " in Stadium" : "";
    emit({ type: "direct", text: `There are no changes to ${heroesWithNoChanges.join(" or ")}${where} in ${target.label}.` });
    return;
  }
  if (results.length === 0) {
    emit({ type: "direct", text: "The patch notes I have don't cover that." });
    return;
  }

  // 2. Generate: the model writes an answer from those chunks only, streamed as it's written
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Sources:\n\n${formatSources(results)}\n\nQuestion: ${question}` +
        (isSummary ? `\n\nThis is a summary: cover EVERY source above, one bullet per hero or topic. Do not skip any.` : ""),
    },
  ];

  // Thinking pieces arrive very fast, so only report "still thinking" a few times a second
  let lastThinking = 0;
  const onThinking = () => {
    const now = Date.now();
    if (now - lastThinking > 300) {
      lastThinking = now;
      emit({ type: "thinking" });
    }
  };
  const onToken = (text: string) => emit({ type: "token", text });

  let { answer, thinkingChars, doneReason } = await chatStream(messages, onToken, onThinking);

  // Fallback: if the model thought so long it ran out of room, retry once without thinking
  if (!answer.trim() && thinkingChars > 0) {
    emit({ type: "retry", thinkingChars });
    ({ answer, doneReason } = await chatStream(messages, onToken, onThinking, false));
  }
  if (!answer.trim()) {
    emit({ type: "empty", doneReason });
    return;
  }

  // 3. Cite: which source numbers did the answer actually use?
  const cited = [...new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))]
    .filter((n) => n >= 1 && n <= sources.length)
    .sort((a, b) => a - b);
  emit({ type: "done", cited });
}
