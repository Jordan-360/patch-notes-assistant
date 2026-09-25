/**
 * labels.test.ts - checks the buff/nerf rules against real patch-note lines.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { labelChanges, labelLine } from "./labels.js";

const cases: [line: string, expected: "buff" | "nerf" | null][] = [
  // Lower is better
  ["Maximum spread when firing a single gun reverted from 1.5 to 1 degree.", "buff"],
  ["Maximum spread when firing both guns increased from 4 to 5 degrees.", "nerf"],
  ["Cooldown increased from 5 to 6 seconds. (5v5)", "nerf"],
  ["Barrier Projector cooldown reduced from 12 to 10 seconds.", "buff"],
  ["Ultimate cost increased by 7%.", "nerf"],
  ["Ultimate cost reduced by 6%.", "buff"],
  ["Cast time decreased from 0.065s to 0.016s.", "buff"],
  ["Cost reduced to 10000 (Down from 12000).", "buff"],
  // Higher is better
  ["Base armor reduced from 150 to 125.", "nerf"],
  ["Damage falloff minimum range when firing both guns reduced from 15 to 10 meters.", "nerf"],
  ["Overhealth gained per shot increased from 3 to 4.", "buff"],
  ["Duration reduced from 8 to 7 seconds.", "nerf"],
  ["Base health increased from 175 to 200.", "buff"],
  ["Duration increased to 5s (Up from 4s).", "buff"],
  ["Speed Boost increased from 25% to 30%.", "buff"],
  ["Pulse Pistols damage reduced from 6 to 5.5 per bullet.", "nerf"],
  // Not a clear numeric change to a known stat: no label
  ["Removed.", null],
  ["Fixed an issue with the Toggle Boosters setting.", null],
  ["Grandmaster 2 - Increased from 175 to 200", null],
];

for (const [line, expected] of cases) {
  test(`${expected ?? "no label"}: ${line}`, () => {
    assert.equal(labelLine(line), expected);
  });
}

test("labelChanges tags only the lines it is sure about", () => {
  const text = "Base armor reduced from 150 to 125.\nChainguns\nRemoved.";
  assert.equal(labelChanges(text), "Base armor reduced from 150 to 125. (nerf)\nChainguns\nRemoved.");
});
