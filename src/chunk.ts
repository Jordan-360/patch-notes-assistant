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

import { heroFromHeaderLine, heroesMentionedIn, normalize, type Role } from "./heroes.js";

export interface PatchInfo {
  title: string;
  date: string;
  url: string;
}

export type Mode = "standard" | "stadium";

export interface Chunk {
  id: string;
  patch: PatchInfo;
  mode: Mode;             // "stadium" for Stadium-only changes, so they never mix with regular balance changes
  section: string;        // e.g. "Ana", "Tank", "Map Updates", "Stadium - Ana"
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

/**
 * The main sections of Overwatch patch notes, and how each one is laid out:
 * - "general": short headings inside it start subsections (e.g. "Battle Pass Revamp")
 * - "heroes":  hero names and role headings start new chunks (ability names don't)
 * - "maps":    headings like "Busan - Control" start a chunk per map
 * If Blizzard adds a new kind of section, add it here.
 */
type SectionKind = "general" | "heroes" | "maps";
const TOP_SECTIONS: Record<string, SectionKind> = {
  generalupdates: "general",
  competitiveplayupdates: "general",
  competitiveupdates: "general",
  coregameupdates: "general",
  heroupdates: "heroes",
  mapupdates: "maps",
  mapreworks: "maps",
  stadiumupdates: "heroes",
  bugfixes: "general",
};

/** Lines that are just image captions or labels, not patch information. */
const SKIP_LINES = new Set(["beforeandafter"]);

const MAP_HEADING = /^.+ - (control|hybrid|escort|push|flashpoint|clash|assault)$/i;

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

/**
 * A short line that reads like a heading: starts with a capital letter, a few words,
 * no sentence punctuation, and no " - " (which marks perk and power names).
 */
function looksLikeSubheading(line: string): boolean {
  return (
    line.length <= 40 &&
    /^[A-Z]/.test(line) &&
    !/[.!?,;]$/.test(line) &&
    !/ [-–] /.test(line) &&
    line.split(/\s+/).length <= 6
  );
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function chunkPatch(patch: PatchInfo, body: string): Chunk[] {
  const chunks: Chunk[] = [];

  // Where we are in the document
  let topSection = "Overview";            // before the first main heading: season intro and highlights
  let topKind: SectionKind = "general";
  let topMode: Mode = "standard";
  let heroZoneStarted = false;            // inside a heroes section, once hero/role headings begin
  let mode: Mode = "standard";
  let section = "Overview";
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
        patch, mode,
        section: mode === "stadium" && !section.includes("Stadium") ? `Stadium - ${section}` : section,
        hero, role,
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
    if (!line || SKIP_LINES.has(normalize(line))) continue;

    const key = normalize(line);
    const topKindForLine = TOP_SECTIONS[key];
    const headerHero = heroFromHeaderLine(line);
    const headerRole = ROLE_HEADERS[line.toLowerCase().replace(/\s*heroes?$/, "")];
    const canUseSubheadings = topKind === "general" || (topKind === "heroes" && !heroZoneStarted);

    if (topKindForLine) {
      // A main section like "Hero Updates" or "Bug Fixes"
      flush();
      topSection = titleCase(line);
      topKind = topKindForLine;
      topMode = key.startsWith("stadium") ? "stadium" : "standard";
      heroZoneStarted = false;
      mode = topMode;
      section = topSection;
      hero = null;
      role = null;
    } else if (headerHero && hero === headerHero.name && lines.length === 0) {
      // Hero names often appear twice in a row (image label + heading), so skip the repeat
      continue;
    } else if (headerHero && topKind !== "maps") {
      // A hero's name on its own line starts that hero's section
      flush();
      heroZoneStarted = true;
      hero = headerHero.name;
      role = headerHero.role;
      section = headerHero.name;
    } else if (headerRole && topKind !== "maps") {
      // "Tank", "Damage", "Support" headings start a role section
      flush();
      heroZoneStarted = true;
      hero = null;
      role = headerRole;
      section = `${topSection} - ${titleCase(headerRole)}`;
    } else if (topKind === "maps" && MAP_HEADING.test(line)) {
      // One chunk per map, e.g. "Busan - Control" (headings like "Point A" stay inside it)
      flush();
      hero = null;
      role = null;
      section = `${topSection} - ${line}`;
    } else if (canUseSubheadings && looksLikeSubheading(line)) {
      // A subsection like "Battle Pass Revamp" or, in Bug Fixes, "Stadium"
      flush();
      mode = key.startsWith("stadium") ? "stadium" : topMode;
      const mentioned = heroesMentionedIn(line);
      hero = mentioned.length === 1 ? mentioned[0].name : null;   // e.g. "New Tank Hero: D.Mon"
      role = mentioned.length === 1 ? mentioned[0].role : null;
      section = `${topSection} - ${line}`;
    } else {
      lines.push(line);
    }
  }
  flush();
  return chunks;
}

/** The text that actually gets embedded: the chunk plus context about where it came from. */
export function textForEmbedding(chunk: Chunk): string {
  const hero = chunk.hero ? `${chunk.hero} (${chunk.role})` : chunk.section;
  const about = chunk.mode === "stadium" && chunk.hero ? `Stadium mode only - ${hero}` : hero;
  return `search_document: ${chunk.patch.title} (${chunk.patch.date}). ${about}:\n${chunk.text}`;
}
