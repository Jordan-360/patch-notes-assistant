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

/** Stats where a SMALLER number is better for the hero. Checked first. */
const LOWER_IS_BETTER = [
  "cooldown", "spread", "cost", "reload", "cast time", "wind-up", "windup", "recovery",
  "delay", "charge time", "lock-on time", "damage taken", "damage received", "self-damage",
];

/** Stats where a BIGGER number is better for the hero. */
const HIGHER_IS_BETTER = [
  "damage", "health", "armor", "shield", "overhealth", "healing", "heal", "range", "radius",
  "speed", "duration", "size", "width", "ammo", "charges", "falloff", "knockback",
  "ultimate charge", "ultimate generation", "regeneration", "lifesteal", "power",
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

/** Which way is better for this stat? Uses the text before the numbers, e.g. "Base armor". */
function betterDirection(line: string): Direction | null {
  const statText = line.split(/\bfrom\b|\bby\b|\bto\b/i)[0].toLowerCase();
  if (LOWER_IS_BETTER.some((word) => statText.includes(word))) return "down";
  if (HIGHER_IS_BETTER.some((word) => statText.includes(word))) return "up";
  return null;
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
