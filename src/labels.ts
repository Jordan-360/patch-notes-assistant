/**
 * labels.ts - marks balance changes as buffs or nerfs with plain rules, not AI.
 *
 * Deciding whether "cooldown reduced from 6 to 5 seconds" is good or bad is simple logic,
 * but small language models get it wrong surprisingly often (and waste thinking time on it).
 * So the code works it out and tags each line before the model ever sees it:
 *
 *   "Cooldown reduced from 6 to 5 seconds."   -> "Cooldown reduced from 6 to 5 seconds. (buff)"
 *   "Base armor reduced from 150 to 125."     -> "Base armor reduced from 150 to 125. (nerf)"
 *
 * Lines it can't be sure about get no tag.
 */

/** Stats where a SMALLER number is better for the hero. */
const LOWER_IS_BETTER = [
  "cooldown", "spread", "cost", "reload", "cast time", "wind-up", "windup", "recovery",
  "delay", "charge time", "lock-on time", "damage taken", "damage received", "self-damage",
  "penalty",
];

/** Stats where a BIGGER number is better for the hero. */
const HIGHER_IS_BETTER = [
  "damage", "health", "armor", "shield", "overhealth", "healing", "heal", "range", "radius",
  "speed", "duration", "size", "width", "ammo", "charges", "falloff", "knockback",
  "ultimate charge", "ultimate generation", "regeneration", "lifesteal", "power",
  "fire rate", "rate of fire", "recharge rate",
];

// "from 150 to 125" / "reverted from 1.5 to 1" / "to 5s (Up from 4s)" / "reduced by 6%"
const FROM_TO = /from\s+(-?[\d.]+)\s*%?\s*(?:[a-z]+\s*)?to\s+(-?[\d.]+)/i;
const TO_UP_FROM = /to\s+(-?[\d.]+)\s*[a-z%]*\s*\((up|down)\s+from/i;
const BY_AMOUNT = /\b(increased|decreased|reduced|lowered|raised)\s+by\s+[\d.]+/i;

type Direction = "up" | "down";

function changeDirection(line: string): Direction | null {
  const fromTo = line.match(FROM_TO);
  if (fromTo) {
    const before = Number(fromTo[1]);
    const after = Number(fromTo[2]);
    if (Number.isNaN(before) || Number.isNaN(after) || before === after) return null;
    return after > before ? "up" : "down";
  }
  const upFrom = line.match(TO_UP_FROM);
  if (upFrom) return upFrom[2].toLowerCase() === "up" ? "up" : "down";
  const by = line.match(BY_AMOUNT);
  if (by) return /increased|raised/i.test(by[1]) ? "up" : "down";
  return null;
}

/**
 * Which way is better for this stat? Uses the text before the numbers, e.g. "Base armor".
 * When several stats are named, the last one wins, since that's the thing being changed:
 * "Reload speed" is a speed (higher is better), "Movement speed penalty" is a penalty (lower is better).
 */
function betterDirection(line: string): Direction | null {
  const statText = line.split(/\bfrom\b|\bby\b|\bto\b/i)[0].toLowerCase();
  const stats: [string, Direction][] = [
    ...LOWER_IS_BETTER.map((word): [string, Direction] => [word, "down"]),
    ...HIGHER_IS_BETTER.map((word): [string, Direction] => [word, "up"]),
  ];
  let best: { end: number; length: number; direction: Direction } | null = null;
  for (const [word, direction] of stats) {
    const start = statText.lastIndexOf(word);
    if (start === -1) continue;
    const end = start + word.length;
    // Prefer the stat that ends last; on a tie, the longer (more specific) one, e.g. "damage taken"
    if (!best || end > best.end || (end === best.end && word.length > best.length)) {
      best = { end, length: word.length, direction };
    }
  }
  return best?.direction ?? null;
}

/** Returns "buff", "nerf", or null when the line isn't a clear numeric change. */
export function labelLine(line: string): "buff" | "nerf" | null {
  const direction = changeDirection(line);
  const better = betterDirection(line);
  if (!direction || !better) return null;
  return direction === better ? "buff" : "nerf";
}

/** Adds a (buff) or (nerf) tag to the end of every line the rules are sure about. */
export function labelChanges(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const label = labelLine(line);
      return label ? `${line} (${label})` : line;
    })
    .join("\n");
}
