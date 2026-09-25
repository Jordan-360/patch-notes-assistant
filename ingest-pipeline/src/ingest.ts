/**
 * ingest.ts - builds the search index.
 *
 * Reads every patch file in data/patches/, splits each into chunks, embeds the
 * chunks with Ollama, and saves everything to data/index.json.
 *
 * Run: npm run ingest
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chunkPatch, parsePatchFile, textForEmbedding, type Chunk } from "./chunk.js";
import { embed, EMBED_MODEL } from "./ollama.js";

const PATCH_DIR = "data/patches";
const INDEX_FILE = "data/index.json";
const BATCH_SIZE = 32; // how many chunks to send to Ollama at once

export interface IndexedChunk extends Chunk {
  embedding: number[];
}

async function main() {
  const files = (await readdir(PATCH_DIR)).filter((f) => f.endsWith(".txt")).sort();
  if (files.length === 0) {
    throw new Error(`No .txt files found in ${PATCH_DIR}. Add a patch file first.`);
  }

  // 1. Chunk every patch file
  const chunks: Chunk[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(PATCH_DIR, file), "utf-8");
    const { patch, body } = parsePatchFile(raw, file);
    const patchChunks = chunkPatch(patch, body);
    chunks.push(...patchChunks);
    console.log(`${file}: ${patchChunks.length} chunks (${patch.title})`);
  }

  // 2. Embed the chunks in batches
  const indexed: IndexedChunk[] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const vectors = await embed(batch.map(textForEmbedding));
    batch.forEach((chunk, j) => indexed.push({ ...chunk, embedding: vectors[j] }));
    console.log(`Embedded ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}`);
  }

  // 3. Save the index
  const index = { model: EMBED_MODEL, createdAt: new Date().toISOString(), chunks: indexed };
  await writeFile(INDEX_FILE, JSON.stringify(index));
  console.log(`Saved ${indexed.length} chunks from ${files.length} patch file(s) to ${INDEX_FILE}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
