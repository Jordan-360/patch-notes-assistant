/**
 * embed-test.ts - see embeddings in action.
 *
 * Turns a question and a few patch-note lines into embeddings (lists of numbers
 * that represent meaning), then ranks the lines by how close their meaning is
 * to the question. This "search by meaning" is the retrieval step of RAG.
 *
 * Run: npx tsx embed-test.ts
 * Needs: Ollama running, with `ollama pull nomic-embed-text` done first.
 */

const OLLAMA_URL = "http://localhost:11434/api/embed";
const EMBED_MODEL = "nomic-embed-text";

// Ask Ollama to turn a list of texts into embeddings (one number array per text)
async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`Ollama returned ${res.status}. Is it running, and did you pull ${EMBED_MODEL}?`);
  }
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings;
}

// Cosine similarity: 1.0 = same meaning, near 0 = unrelated
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function main() {
  const question = "Did Ana's sleep dart get weaker?";

  // Made-up sample lines, standing in for chunks of real patch notes
  const chunks = [
    "Ana: Sleep Dart projectile size reduced from 0.2 to 0.15.",
    "Reinhardt: Barrier Field health increased from 1200 to 1400.",
    "Support heroes: crowd control durations shortened across the role.",
    "Map update: new flank route added to King's Row.",
  ];

  const [questionVector, ...chunkVectors] = await embed([question, ...chunks]);
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
