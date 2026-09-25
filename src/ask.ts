/**
 * ask.ts - answers a question about the patch notes, with citations.
 * This is the full RAG loop: retrieve the relevant chunks, then have a
 * language model write an answer using only those chunks.
 *
 * Run: npm run ask -- "What changed for Tracer?"
 */

import { CHAT_MODEL, chatStream, type ChatMessage } from "./ollama.js";
import { loadIndex, retrieve, type Result } from "./retrieve.js";

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
- Label each change as a buff or a nerf only when you are sure. Lower is BETTER for: cooldowns, spread, ultimate cost, reload time, cast time, damage taken. Higher is BETTER for: damage, health, armor, shields, healing, range, speed, duration. If a Developer Comment says what a change is for, trust it. If unsure, leave the label off.
- If a source is marked "Stadium mode only", say that the change only applies in Stadium.
- If a source is a bug fix, call it a bug fix, not a buff or nerf.
- If the sources come from more than one patch, group the bullets by patch, newest patch first, with the patch date as a short heading.
- Keep it short and easy to skim: a one-sentence summary first, then bullet points.`;

/** Formats the retrieved chunks as numbered sources for the model to read. */
function formatSources(results: Result[]): string {
  return results
    .map(({ chunk }, i) => {
      const stadium = chunk.mode === "stadium" ? " (Stadium mode only)" : "";
      return `[${i + 1}] ${chunk.patch.title} - ${chunk.section}${stadium}\n${chunk.text}`;
    })
    .join("\n\n");
}

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    throw new Error('Ask a question, e.g. npm run ask -- "What changed for Tracer?"');
  }

  // 1. Retrieve: find the most relevant chunks
  const chunks = await loadIndex();
  const isSummary = SUMMARY_QUESTION.test(question);
  const { results: ranked, filterNote, heroesWithNoChanges, target } = await retrieve(
    question,
    chunks,
    isSummary ? SUMMARY_TOP_K : TOP_K,
  );
  // Summaries keep every filtered chunk, in the order they appear in the patch notes;
  // normal questions keep only chunks that are close enough in meaning
  const results = isSummary
    ? [...ranked].sort(
        (a, b) =>
          b.chunk.patch.date.localeCompare(a.chunk.patch.date) || // newest patch first
          chunks.indexOf(a.chunk) - chunks.indexOf(b.chunk),       // then in patch-notes order
      )
    : ranked.filter((r) => r.score >= MIN_SCORE);

  console.log(`Question: ${question}`);
  console.log(`Filter:   ${filterNote}\n`);

  if (target.notFound) {
    console.log(`I don't have ${target.label} in my patch notes. Add the patch file to data/patches/ and run "npm run ingest".`);
    return;
  }
  if (heroesWithNoChanges.length > 0) {
    // The data already answers this, so there's no need to ask the model
    const where = /\bstadium\b/i.test(question) ? " in Stadium" : "";
    console.log(`There are no changes to ${heroesWithNoChanges.join(" or ")}${where} in ${target.label}.`);
    return;
  }
  if (results.length === 0) {
    console.log("The patch notes I have don't cover that.");
    return;
  }

  console.log(`(${CHAT_MODEL} is reading ${results.length} source(s)${isSummary ? ", summary mode" : ""}...)\n`);

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

  let thinkingShown = false;
  const printToken = (text: string) => {
    if (thinkingShown) {
      process.stdout.write("\n\n"); // end the "thinking" dots line before the answer starts
      thinkingShown = false;
    }
    process.stdout.write(text);
  };
  const printThinking = () => {
    // Show a dot now and then while a thinking model reasons, so it's clear it's working
    if (!thinkingShown) process.stdout.write("Thinking");
    thinkingShown = true;
    if (Math.random() < 0.05) process.stdout.write(".");
  };

  let { answer, thinkingChars, doneReason } = await chatStream(messages, printToken, printThinking);

  // Fallback: if the model thought so long it ran out of room, retry once without thinking
  if (!answer.trim() && thinkingChars > 0) {
    console.log(`\n\n(Thinking ran too long: ${thinkingChars.toLocaleString()} characters. Retrying without thinking...)\n`);
    thinkingShown = false;
    ({ answer, doneReason } = await chatStream(messages, printToken, printThinking, false));
  }

  if (!answer.trim()) {
    console.log("\n\nThe model returned an empty answer.");
    console.log(`  Stop reason: ${doneReason}${doneReason === "length" ? " (it ran out of room)" : ""}`);
    return;
  }

  // 3. Cite: list only the sources the answer actually referenced, like [1] or [3]
  const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const citedResults = results
    .map((result, i) => ({ result, number: i + 1 }))
    .filter(({ number }) => cited.has(number));

  if (citedResults.length === 0) {
    console.log("\n\n(No sources cited.)");
    return;
  }
  console.log("\n\nSources:");
  for (const { result, number } of citedResults) {
    console.log(`  [${number}] ${result.chunk.patch.title} - ${result.chunk.section}`);
    console.log(`      ${result.chunk.patch.url}`);
  }

  // Sources the model was given but didn't use: handy for spotting answers that skipped something
  const unused = results
    .map((result, i) => ({ result, number: i + 1 }))
    .filter(({ number }) => !cited.has(number));
  if (unused.length > 0) {
    console.log("\nRetrieved but not cited:");
    for (const { result, number } of unused) console.log(`  [${number}] ${result.chunk.section}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
