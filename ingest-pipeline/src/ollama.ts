/**
 * ollama.ts - talks to the local Ollama server.
 */

// Override with the OLLAMA_URL environment variable if Ollama runs somewhere else
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const EMBED_MODEL = "nomic-embed-text";

/**
 * Turns texts into embeddings (one list of numbers per text).
 * nomic-embed-text works best when texts are labeled by role, so callers add
 * "search_query: " to questions and "search_document: " to patch-note chunks.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(
      `Ollama returned ${res.status}. Is Ollama running, and did you run "ollama pull ${EMBED_MODEL}"?`,
    );
  }
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings;
}

/** Cosine similarity: 1.0 = same meaning, near 0 = unrelated. */
export function cosineSimilarity(a: number[], b: number[]): number {
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
