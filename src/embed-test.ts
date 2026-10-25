/**
 * embed-test.ts - see embeddings in action.
 *
 * Turns a question and a few patch-note lines into embeddings (lists of numbers
 * that represent meaning), then ranks the lines by how close their meaning is
 * to the question. This "search by meaning" is the retrieval step of RAG.
 *
 * Run: npm run embed-test   (needs Ollama running with nomic-embed-text pulled)
 */

import { cosineSimilarity, embed } from "./ollama.js";

async function main() {
  const question = "Did Ana's sleep dart get weaker?";

  // Made-up sample lines, standing in for chunks of real patch notes
  const chunks = [
    "Ana: Sleep Dart projectile size reduced from 0.2 to 0.15.",
    "Reinhardt: Barrier Field health increased from 1200 to 1400.",
    "Support heroes: crowd control durations shortened across the role.",
    "Map update: new flank route added to King's Row.",
  ];

  // Same prefixes the real index uses (see ollama.ts)
  const [questionVector, ...chunkVectors] = await embed([
    `search_query: ${question}`,
    ...chunks.map((text) => `search_document: ${text}`),
  ]);
  console.log(`Each embedding is a list of ${questionVector.length} numbers.\n`);
  console.log(`Question: "${question}"\n`);

  const ranked = chunks
    .map((text, i) => ({ text, score: cosineSimilarity(questionVector, chunkVectors[i]) }))
    .sort((a, b) => b.score - a.score);

  console.log("Chunks ranked by similarity to the question:");
  for (const { text, score } of ranked) {
    console.log(`  ${score.toFixed(3)}  ${text}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
