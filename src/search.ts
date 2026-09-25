/**
 * search.ts - shows which patch-note chunks a question retrieves, without generating an answer.
 * Handy for checking retrieval quality.
 *
 * Run: npm run search -- "Did Ana's sleep dart get weaker?"
 */

import { loadIndex, retrieve } from "./retrieve.js";

const TOP_K = 5;

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    throw new Error('Ask a question, e.g. npm run search -- "What changed for Ana?"');
  }

  const chunks = await loadIndex();
  const { results, filterNote } = await retrieve(question, chunks, TOP_K);

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
