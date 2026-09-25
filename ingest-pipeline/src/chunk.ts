/**
 * chunk.ts - splits one patch-notes file into small, searchable chunks.
 *
 * Patch files live in data/patches/ and start with a short header:
 *
 *   title: Overwatch Patch Notes - October 14, 2026
 *   date: 2026-10-14
 *   url: https://link-to-the-official-patch-notes
 *   ---
 *   (patch notes text pasted below)
 *
 * The goal is one chunk per hero (or per non-hero section), so each chunk is
 * about exactly one thing. That makes search results much more precise.
 */

import { heroFromHeaderLine, type Role } from "./heroes.js";

export interface PatchInfo {
  title: string;
  date: string;
  url: string;
}

export interface Chunk {
  id: string;
  patch: PatchInfo;
  section: string;        // e.g. "Ana", "Tank", "Map Updates"
  hero: string | null;    // set when the chunk is about one hero
  role: Role | null;      // set for hero chunks and role-wide sections
  text: string;           // the patch-note lines themselves
}

const MAX_CHUNK_CHARS = 1200; // long sections get split so each chunk stays focused

const ROLE_HEADERS: Record<string, Role> = {
  tank: "tank", tanks: "tank",
  damage: "damage", dps: "damage",
  support: "support", supports: "support",
};

/** Reads the "key: value" header above the --- line. */
export function parsePatchFile(raw: string, fileName: string): { patch: PatchInfo; body: string } {
  const divider = raw.indexOf("\n---");
  if (divider === -1) {
    throw new Error(`${fileName} is missing the "---" line under its header.`);
  }
  const header: Record<string, string> = {};
  for (const line of raw.slice(0, divider).split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0) header[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  for (const key of ["title", "date", "url"]) {
    if (!header[key]) throw new Error(`${fileName} is missing "${key}:" in its header.`);
  }
  const body = raw.slice(raw.indexOf("\n", divider + 1) + 1);
  return { patch: { title: header.title, date: header.date, url: header.url }, body };
}

/** A short line in ALL CAPS, like "MAP UPDATES" or "BUG FIXES", starts a new section. */
function isSectionHeader(line: string): boolean {
  return line.length <= 40 && /[A-Z]/.test(line) && line === line.toUpperCase() && !/[.!?]$/.test(line);
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function chunkPatch(patch: PatchInfo, body: string): Chunk[] {
  const chunks: Chunk[] = [];
  let section = "General";
  let hero: string | null = null;
  let role: Role | null = null;
  let lines: string[] = [];

  // Save whatever lines have built up as one or more chunks
  const flush = () => {
    if (lines.length === 0) return;
    let part: string[] = [];
    let size = 0;
    const pushPart = () => {
      if (part.length === 0) return;
      chunks.push({
        id: `${patch.date}-${chunks.length}`,
        patch, section, hero, role,
        text: part.join("\n"),
      });
      part = [];
      size = 0;
    };
    for (const line of lines) {
      if (size + line.length > MAX_CHUNK_CHARS) pushPart();
      part.push(line);
      size += line.length + 1;
    }
    pushPart();
    lines = [];
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const headerHero = heroFromHeaderLine(line);
    const headerRole = ROLE_HEADERS[line.toLowerCase().replace(/\s*heroes?$/, "")];

    if (headerHero) {
      // A hero's name on its own line starts that hero's section
      flush();
      hero = headerHero.name;
      role = headerHero.role;
      section = headerHero.name;
    } else if (headerRole) {
      // "TANK", "DAMAGE", "SUPPORT" headers start a role section
      flush();
      hero = null;
      role = headerRole;
      section = titleCase(headerRole);
    } else if (isSectionHeader(line)) {
      // Any other ALL CAPS heading, like "MAP UPDATES"
      flush();
      hero = null;
      role = null;
      section = titleCase(line);
    } else {
      lines.push(line);
    }
  }
  flush();
  return chunks;
}

/** The text that actually gets embedded: the chunk plus context about where it came from. */
export function textForEmbedding(chunk: Chunk): string {
  const about = chunk.hero ? `${chunk.hero} (${chunk.role})` : chunk.section;
  return `search_document: ${chunk.patch.title} (${chunk.patch.date}). ${about}:\n${chunk.text}`;
}
