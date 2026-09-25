/**
 * questions.ts - builds the final question from what the user typed and the patch they picked.
 */

import type { PatchInfo } from "./types";

export type PatchScope = "all" | "latest" | string; // a string date like "2026-09-08" means that patch

/** "2026-09-08" -> "September 8" */
export function formatPatchDate(date: string, withYear = false): string {
  const [year, month, day] = date.split("-").map(Number);
  const text = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
    ...(withYear ? { year: "numeric" } : {}),
  });
  return text;
}

// Matches the patch phrases the server understands, so we don't add a second one
const MENTIONS_PATCH =
  /\b(latest|newest|current|this|last|most recent|new)\s+(patch|update)|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b/i;

/** Adds "in the latest patch" or "in the September 8 patch" unless the question already names one. */
export function withPatchScope(question: string, scope: PatchScope): string {
  const trimmed = question.trim().replace(/[?.!\s]+$/, "");
  if (scope === "all" || MENTIONS_PATCH.test(trimmed)) return question.trim();
  const patch = scope === "latest" ? "the latest patch" : `the ${formatPatchDate(scope)} patch`;
  return `${trimmed} in ${patch}?`;
}

export const QUICK_QUESTIONS = [
  { label: "Patch summary", question: "Summarize the latest patch" },
  { label: "Tanks", question: "Summarize the latest patch for tank players" },
  { label: "Damage", question: "Summarize the latest patch for damage players" },
  { label: "Supports", question: "Summarize the latest patch for support players" },
  { label: "Stadium", question: "Summarize the Stadium changes in the latest patch" },
];

export function patchOptions(patches: PatchInfo[]) {
  return [
    { value: "all", label: "All patches" },
    { value: "latest", label: "Latest patch" },
    ...patches.map((p) => ({ value: p.date, label: formatPatchDate(p.date, true) })),
  ];
}
