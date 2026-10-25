import {
  addDays,
  daysBetween,
  isoWeekday,
  localDate,
  money,
  type LocalDate,
  type Money,
} from '@allotr/shared';

/**
 * How much of `whole` is `part`, for drawing a bar's width only. Both come
 * from the server; the result is never shown as money. Zero or negative
 * `whole` draws an empty bar, and the fraction stays within 0–1.
 */
export function barFraction(part: number, whole: number): number {
  if (!(whole > 0) || !(part > 0)) return 0;
  // Two infinite figures have no ratio; draw them as a full bar.
  if (!Number.isFinite(whole)) return Number.isFinite(part) ? 0 : 1;
  return Math.min(1, part / whole);
}

/** The ISO 8601 week number of a calendar day (weeks start on Monday). */
export function isoWeek(date: LocalDate): number {
  // The week belongs to the year its Thursday falls in.
  const thursday = addDays(date, 4 - isoWeekday(date));
  const january1 = localDate(`${thursday.slice(0, 4)}-01-01`);
  return Math.floor(daysBetween(january1, thursday) / 7) + 1;
}

/**
 * Where today sits in the cycle, counted from dates (not money): the day
 * number from 1 and the cycle's length in days, from the day it opened to
 * the day before payday.
 */
export function cycleDays(
  openedOn: LocalDate,
  today: LocalDate,
  payday: LocalDate,
): { day: number; length: number } {
  const length = Math.max(1, daysBetween(openedOn, payday));
  const day = Math.min(length, Math.max(1, daysBetween(openedOn, today) + 1));
  return { day, length };
}

/**
 * Today's allowance against yesterday's, from the server's `allowanceChange`
 * with its sign dropped, so the arrow carries the direction. Null when there
 * is nothing to compare or nothing changed.
 */
export function yesterdayChange(
  change: Money | null,
): Readonly<{ up: boolean; amount: Money }> | null {
  if (change === null || change.amountMinor === 0) return null;
  return {
    up: change.amountMinor > 0,
    amount: money(Math.abs(change.amountMinor), change.currency),
  };
}
