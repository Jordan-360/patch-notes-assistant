/**
 * heroes.ts - the hero roster, used to recognize hero sections in patch notes
 * and hero names in questions.
 *
 * Keep this list up to date: when a new hero is released, add them here.
 */

export type Role = "tank" | "damage" | "support";

export interface Hero {
  name: string;
  role: Role;
}

const TANKS = [
  "D.Mon", "D.Va", "Domina", "Doomfist", "Hazard", "Junker Queen", "Mauga",
  "Orisa", "Ramattra", "Reinhardt", "Roadhog", "Sigma", "Winston",
  "Wrecking Ball", "Zarya",
];
const DAMAGE = [
  "Anran", "Ashe", "Bastion", "Cassidy", "Echo", "Emre", "Freja", "Genji",
  "Hanzo", "Junkrat", "Mei", "Pharah", "Reaper", "Shion", "Sierra", "Sojourn",
  "Soldier: 76", "Sombra", "Symmetra", "Torbjörn", "Tracer", "Vendetta",
  "Venture", "Widowmaker",
];
const SUPPORTS = [
  "Ana", "Baptiste", "Brigitte", "Illari", "Jetpack Cat", "Juno", "Kiriko",
  "Lifeweaver", "Lúcio", "Mercy", "Mizuki", "Moira", "Wuyang", "Zenyatta",
];

export const HEROES: Hero[] = [
  ...TANKS.map((name) => ({ name, role: "tank" as Role })),
  ...DAMAGE.map((name) => ({ name, role: "damage" as Role })),
  ...SUPPORTS.map((name) => ({ name, role: "support" as Role })),
];

/** Lowercase, strip accents and punctuation: "Soldier: 76" -> "soldier76", "Lúcio" -> "lucio". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const heroByNormalizedName = new Map(HEROES.map((h) => [normalize(h.name), h]));

/** If a whole line is just a hero's name (a section header), returns that hero. */
export function heroFromHeaderLine(line: string): Hero | undefined {
  return heroByNormalizedName.get(normalize(line));
}

/** Finds every hero mentioned anywhere in a piece of text, like a user's question. */
export function heroesMentionedIn(text: string): Hero[] {
  const plain = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return HEROES.filter((hero) => {
    // "D.Va" should match "dva", "d.va" and "d va"; \b stops "Ana" matching inside "banana"
    const pattern = normalize(hero.name).split("").join("[^a-z0-9]*");
    return new RegExp(`\\b${pattern}\\b`).test(plain);
  });
}

/** Finds a role mentioned in a question, like "for tank players". */
export function roleMentionedIn(text: string): Role | undefined {
  const plain = text.toLowerCase();
  if (/\btanks?\b/.test(plain)) return "tank";
  if (/\b(supports?|healers?)\b/.test(plain)) return "support";
  if (/\b(damage|dps)\b/.test(plain)) return "damage";
  return undefined;
}
