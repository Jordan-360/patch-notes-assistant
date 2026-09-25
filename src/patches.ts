/**
 * patches.ts - works out which patch (or patches) a question is about.
 *
 *   "Summarize the latest patch"       -> only the newest patch
 *   "What changed in the September 8 patch?" -> only that date
 *   "What changed for Mauga in August?"      -> every patch from August
 *   "What changed for Mauga?"                -> every patch (no target)
 */

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_PATTERN =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const LATEST = /\b(latest|newest|current|this|last|most recent|new)\s+(patch|update|patch notes)\b/i;
const MONTH_DAY = new RegExp(`\\b${MONTH_PATTERN}\\.?(?:\\s+(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s+(\\d{4}))?\\b`, "i");
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;

export interface PatchTarget {
  dates: string[] | null;  // null = no target, search every patch
  label: string;           // e.g. "the latest patch (2026-09-08)", used in messages
  notFound: boolean;       // the question named a patch we don't have
}

/** Turns "Sept" or "september" into "09". */
function monthNumber(name: string): string {
  const index = MONTHS.findIndex((m) => m.startsWith(name.toLowerCase().slice(0, 3)));
  return String(index + 1).padStart(2, "0");
}

/** allDates are the patch dates in the index, like ["2026-08-11", "2026-09-08"]. */
export function resolvePatchTarget(question: string, allDates: string[]): PatchTarget {
  const dates = [...new Set(allDates)].sort().reverse(); // newest first

  const iso = question.match(ISO_DATE);
  if (iso) {
    const date = iso[0];
    return { dates: [date], label: `the ${date} patch`, notFound: !dates.includes(date) };
  }

  const monthDay = question.match(MONTH_DAY);
  // "may" is also an everyday word, so only treat it as a month when a day number follows
  if (monthDay && !(monthDay[1].toLowerCase() === "may" && !monthDay[2])) {
    const month = monthNumber(monthDay[1]);
    const day = monthDay[2] ? monthDay[2].padStart(2, "0") : null;
    const year = monthDay[3] ?? null;
    const matches = dates.filter((d) => {
      const [y, m, dd] = d.split("-");
      return m === month && (!day || dd === day) && (!year || y === year);
    });
    const name = MONTHS[Number(month) - 1];
    const label = `the ${name[0].toUpperCase() + name.slice(1)}${day ? ` ${Number(day)}` : ""}${year ? `, ${year}` : ""} patch${day ? "" : "es"}`;
    return { dates: matches, label, notFound: matches.length === 0 };
  }

  if (LATEST.test(question) && dates.length > 0) {
    return { dates: [dates[0]], label: `the latest patch (${dates[0]})`, notFound: false };
  }

  return { dates: null, label: "the patch notes I have", notFound: false };
}
