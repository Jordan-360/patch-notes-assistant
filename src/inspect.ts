/**
 * inspect.ts - preview how a patch file gets chunked, without embedding anything.
 * Use it after adding a new patch file to check the hero sections were detected.
 *
 * Run: npm run inspect -- data/patches/2026-08-11.txt
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { chunkPatch, parsePatchFile } from "./chunk.js";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Pass a patch file, e.g. npm run inspect -- data/patches/2026-08-11.txt");

  const raw = await readFile(file, "utf-8");
  const { patch, body } = parsePatchFile(raw, path.basename(file));
  const chunks = chunkPatch(patch, body);

  console.log(`${patch.title} (${patch.date})`);
  console.log(`${chunks.length} chunks\n`);
  for (const chunk of chunks) {
    const tag = chunk.mode === "stadium" ? "[STADIUM] " : "";
    const label = tag + (chunk.hero ? `HERO  ${chunk.hero} (${chunk.role})` : `SECTION  ${chunk.section}`);
    const firstLine = chunk.text.split("\n")[0].slice(0, 80);
    console.log(`${label.padEnd(42)} ${chunk.text.length.toString().padStart(5)} chars | ${firstLine}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
