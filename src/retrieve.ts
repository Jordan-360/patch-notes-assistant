/**
 * retrieve.ts - finds the patch-note chunks most related to a question.
 * This is the "retrieval" half of RAG. Used by both search.ts and ask.ts.
 */

import { readFile } from "node:fs/promises";
import { heroesMentionedIn, roleMentionedIn } from "./heroes.js";
import { cosineSimilarity, embed } from "./ollama.js";
import type { IndexedChunk } from "./ingest.js";

const INDEX_FILE = "data/index.json";

export interface Result {
  chunk: IndexedChunk;
  score: number;
}

export async function loadIndex(): Promise<IndexedChunk[]> {
  try {
    const { chunks } = JSON.parse(await readFile(INDEX_FILE, "utf-8")) as { chunks: IndexedChunk[] };
    return chunks;
  } catch {
    throw new Error(`Couldn't read ${INDEX_FILE}. Run "npm run ingest" first.`);
  }
}

export async function retrieve(
  question: string,
  chunks: IndexedChunk[],
  topK: number,
): Promise<{ results: Result[]; filterNote: string; heroesWithNoChanges: string[] }> {
  // Stadium is its own mode: only search it when the question asks about Stadium
  const wantsStadium = /\bstadium\b/i.test(question);
  const modeChunks = chunks.filter((c) => (c.mode === "stadium") === wantsStadium);

  // Metadata filter: if the question names heroes or a role, only search those chunks
  const mentioned = heroesMentionedIn(question);
  const heroes = mentioned.map((h) => h.name);
  const heroRoles = new Set(mentioned.map((h) => h.role));
  const role = roleMentionedIn(question);
  let candidates = modeChunks;
  let filterNote = "none (searching everything)";
  if (heroes.length > 0) {
    // the heroes' own sections, plus role-wide changes that also affect them ("All supports: ...")
    candidates = modeChunks.filter(
      (c) => (c.hero && heroes.includes(c.hero)) || (!c.hero && c.role && heroRoles.has(c.role)),
    );
    filterNote = `heroes = ${heroes.join(", ")} (plus changes to their whole role)`;

    // A named hero with no chunks of their own has no changes, so don't search unrelated heroes
    const heroesWithNoChanges = heroes.filter((name) => !modeChunks.some((c) => c.hero === name));
    if (heroesWithNoChanges.length === heroes.length) {
      filterNote += wantsStadium ? " | Stadium only" : " | Stadium excluded";
      return { results: [], filterNote, heroesWithNoChanges };
    }
  } else if (role) {
    candidates = modeChunks.filter((c) => c.role === role);
    filterNote = `role = ${role}`;
  }
  if (candidates.length === 0) {
    candidates = modeChunks; // nothing matched the filter, so fall back to everything in this mode
    filterNote += " (no matching chunks, searched everything instead)";
  }
  filterNote += wantsStadium ? " | Stadium only" : " | Stadium excluded";

  // Embed the question and rank candidate chunks by similarity
  const [questionVector] = await embed([`search_query: ${question}`]);
  const results = candidates
    .map((chunk) => ({ chunk, score: cosineSimilarity(questionVector, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { results, filterNote, heroesWithNoChanges: [] };
}
