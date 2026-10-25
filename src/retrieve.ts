/**
 * retrieve.ts - loads the index and finds the patch-note chunks most related to a question.
 * This is the "retrieval" half of RAG, used by answer.ts and search.ts.
 */

import { readFile } from "node:fs/promises";
import type { Chunk } from "./chunk.js";
import { heroesMentionedIn, roleMentionedIn } from "./heroes.js";
import { cosineSimilarity, embed } from "./ollama.js";
import { resolvePatchTarget, type PatchTarget } from "./patches.js";

export const INDEX_FILE = "data/index.json";

export interface IndexedChunk extends Chunk {
  embedding: number[];
}

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

/** Stadium is its own mode: only search it when the question asks about Stadium. */
export function wantsStadium(question: string): boolean {
  return /\bstadium\b/i.test(question);
}

export async function retrieve(
  question: string,
  chunks: IndexedChunk[],
  topK: number,
  signal?: AbortSignal,
): Promise<{ results: Result[]; filterNote: string; heroesWithNoChanges: string[]; target: PatchTarget }> {
  // Which patch is the question about? ("the latest patch", "the September 8 patch", or all of them)
  const target = resolvePatchTarget(question, chunks.map((c) => c.patch.date));
  if (target.notFound) {
    return { results: [], filterNote: `patch = ${target.label} (not in the index)`, heroesWithNoChanges: [], target };
  }
  const patchChunks = target.dates ? chunks.filter((c) => target.dates!.includes(c.patch.date)) : chunks;

  const stadium = wantsStadium(question);
  const modeChunks = patchChunks.filter((c) => (c.mode === "stadium") === stadium);
  const scopeNote =
    (stadium ? " | Stadium only" : " | Stadium excluded") +
    (target.dates ? ` | patch = ${target.dates.join(", ")}` : " | all patches");

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
      return { results: [], filterNote: filterNote + scopeNote, heroesWithNoChanges, target };
    }
  } else if (role) {
    candidates = modeChunks.filter((c) => c.role === role);
    filterNote = `role = ${role}`;
  }
  if (candidates.length === 0) {
    candidates = modeChunks; // nothing matched the filter, so fall back to everything in this mode
    filterNote += " (no matching chunks, searched everything instead)";
  }
  filterNote += scopeNote;

  // Embed the question and rank candidate chunks by similarity
  const [questionVector] = await embed([`search_query: ${question}`], signal);
  const results = candidates
    .map((chunk) => ({ chunk, score: cosineSimilarity(questionVector, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { results, filterNote, heroesWithNoChanges: [], target };
}
