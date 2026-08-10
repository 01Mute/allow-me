/**
 * Counting the days on the wall.
 *
 * Kept apart from the rendering because this is the part that can be quietly
 * wrong: a timezone slip shows the wrong number of days and nothing errors.
 */

/** Day one. The date the page went up. */
export const TALLY_EPOCH = "2026-08-10";

export const MARKS_PER_GROUP = 5;
/** Enough wall for a few years; past this the screen is solid scratches anyway. */
export const MAX_MARKS = 1200;

/** Midnight in Seoul for the calendar day this instant falls on, as ms UTC. */
function kstDayStart(date: Date): number {
  // en-CA formats as YYYY-MM-DD, which Date.parse reads as a UTC calendar day.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return Date.parse(`${ymd}T00:00:00Z`);
}

/** Days on the wall, counting the epoch itself as day one. */
export function daysElapsed(now: Date, epoch: string = TALLY_EPOCH): number {
  const days = Math.floor((kstDayStart(now) - Date.parse(`${epoch}T00:00:00Z`)) / 86_400_000);
  // A clock skewed early must not wipe the wall clean.
  return Math.min(Math.max(days + 1, 1), MAX_MARKS);
}

/** Splits a total into full groups of five plus whatever remains. */
export function groupMarks(total: number): number[] {
  const groups = Array<number>(Math.floor(total / MARKS_PER_GROUP)).fill(MARKS_PER_GROUP);
  const remainder = total % MARKS_PER_GROUP;
  if (remainder) groups.push(remainder);
  return groups;
}
