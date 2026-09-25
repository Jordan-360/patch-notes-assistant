/**
 * search.ts - finds the patch-note chunks most related to a question.
 * This is the "retrieval" half of RAG, before any AI writes an answer.
 *
 * Run: npm run search -- "Did Ana's sleep dart get weaker?"
 */

import { readFile } from "node:fs/promises";
import { heroesMentionedIn, roleMentionedIn } from "./heroes.js";
import { cosineSimilarity, embed } from "./ollama.js";
import type { IndexedChunk } from "./ingest.js";

const INDEX_FILE = "data/index.json";
const TOP_K = 5; // how many results to show

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    throw new Error('Ask a question, e.g. npm run search -- "What changed for Ana?"');
  }

  const { chunks } = JSON.parse(await readFile(INDEX_FILE, "utf-8")) as { chunks: IndexedChunk[] };

  // Metadata filter: if the question names heroes or a role, only search those chunks
  const mentioned = heroesMentionedIn(question);
  const heroes = mentioned.map((h) => h.name);
  const heroRoles = new Set(mentioned.map((h) => h.role));
  const role = roleMentionedIn(question);
  let candidates = chunks;
  let filterNote = "none (searching everything)";
  if (heroes.length > 0) {
    // the heroes' own sections, plus role-wide changes that also affect them ("All supports: ...")
    candidates = chunks.filter(
      (c) => (c.hero && heroes.includes(c.hero)) || (!c.hero && c.role && heroRoles.has(c.role)),
    );
    filterNote = `heroes = ${heroes.join(", ")} (plus changes to their whole role)`;
  } else if (role) {
    candidates = chunks.filter((c) => c.role === role);
    filterNote = `role = ${role}`;
  }
  if (candidates.length === 0) {
    candidates = chunks; // nothing matched the filter, so fall back to everything
    filterNote += " (no matching chunks, searched everything instead)";
  }

  // Embed the question and rank candidate chunks by similarity
  const [questionVector] = await embed([`search_query: ${question}`]);
  const results = candidates
    .map((chunk) => ({ chunk, score: cosineSimilarity(questionVector, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  console.log(`Question: "${question}"`);
  console.log(`Filter:   ${filterNote}\n`);
  for (const { chunk, score } of results) {
    console.log(`${score.toFixed(3)}  [${chunk.section}] ${chunk.patch.title} (${chunk.patch.date})`);
    console.log(`       ${chunk.text.replace(/\n/g, "\n       ")}`);
    console.log(`       Source: ${chunk.patch.url}\n`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
