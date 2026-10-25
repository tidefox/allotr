import {
  money as moneyOf,
  type BudgetView,
  type CycleDayView,
  type Money,
} from '@allotr/shared';
import type { Point } from '@/charts/math';
import { todayRow } from '@/features/today/state';

// The "this cycle" tile's view model. Every amount is a figure the server
// sent; this file only compares whole minor units and counts days.

/**
 * Spending against the even pace, from the server's `paceDiff` (positive is
 * under pace). `amount` is that figure with its sign dropped, so the label
 * carries the direction; it is not a new amount.
 */
export type PaceFigure = Readonly<{
  status: 'under' | 'on' | 'over';
  amount: Money;
}>;

export function paceFigure(paceDiff: Money): PaceFigure {
  const { amountMinor, currency } = paceDiff;
  return {
    status: amountMinor > 0 ? 'under' : amountMinor < 0 ? 'over' : 'on',
    amount: moneyOf(Math.abs(amountMinor), currency),
  };
}

export interface CycleView {
  /** Pace spending so far: the series' last point. */
  spent: Money | null;
  /** The even-pace figure for today. */
  pace: Money | null;
  /** Days where spending passed that day's allowance. */
  daysOver: number;
  /** 1-based day of the cycle, and how many days it has. */
  day: number;
  length: number;
  /** Cumulative pace spending per day with figures, x = day index. */
  spentPoints: Point[];
  /**
   * Where spending is heading at the recent daily rate, from today to the
   * last day (server figures); empty when the cycle has no days with figures.
   */
  forecastPoints: Point[];
  /** The even pace from the first day to the last. */
  reference: { from: Point; to: Point } | null;
  /** Index of today in `days`; -1 when the series has no figures yet. */
  todayIndex: number;
}

/** What one source covered for one budget this period, the server's figure. */
export type CoverUsedItem = Readonly<{
  budget: string;
  source: string;
  amount: Money;
}>;

/**
 * Every (budget, source) the server says covered something this period,
 * in budget order and then cover order. Nothing is added up: each item is
 * one server amount.
 */
export function coverUsedItems(
  budgets: readonly Pick<BudgetView, 'name' | 'coverUsed'>[],
): CoverUsedItem[] {
  return budgets.flatMap((b) =>
    b.coverUsed.map((used) => ({
      budget: b.name,
      source: used.name,
      amount: used.amount,
    })),
  );
}

export function daysOver(days: readonly CycleDayView[]): number {
  return days.filter(
    (day) =>
      day.spent !== null &&
      day.allowance !== null &&
      day.spent.amountMinor > day.allowance.amountMinor,
  ).length;
}

export function cycleView(days: readonly CycleDayView[]): CycleView {
  const row = todayRow(days);
  const todayIndex = row === undefined ? -1 : days.indexOf(row);
  const first = days[0];
  const last = days.at(-1);
  return {
    spent: row?.cumulativeSpent ?? null,
    pace: row?.pace ?? null,
    daysOver: daysOver(days),
    day: todayIndex + 1,
    length: days.length,
    spentPoints: days.flatMap((day, x) =>
      day.cumulativeSpent === null
        ? []
        : [{ x, y: day.cumulativeSpent.amountMinor }],
    ),
    forecastPoints: days.flatMap((day, x) =>
      day.forecast === null ? [] : [{ x, y: day.forecast.amountMinor }],
    ),
    reference:
      first === undefined || last === undefined
        ? null
        : {
            from: { x: 0, y: first.pace.amountMinor },
            to: { x: days.length - 1, y: last.pace.amountMinor },
          },
    todayIndex,
  };
}

/** An x tick on the cycle chart: a day's date, or the today marker. */
export type CycleTick = Readonly<{ index: number; today: boolean }>;

/**
 * Weekly ticks from the first day, the last day and today. A weekly tick
 * closer than four days to today or the last day gives way, so labels
 * never overlap. Pure day counting.
 */
export function cycleTicks(length: number, todayIndex: number): CycleTick[] {
  if (length <= 0) return [];
  const last = length - 1;
  const near = (a: number, b: number) => Math.abs(a - b) < 4;
  const ticks: CycleTick[] = [];
  for (let index = 0; index < last; index += 7) {
    if (index === todayIndex) continue;
    if (index !== 0 && (near(index, last) || near(index, todayIndex))) continue;
    ticks.push({ index, today: false });
  }
  if (last > 0 && last !== todayIndex)
    ticks.push({ index: last, today: false });
  if (todayIndex >= 0) {
    // Today wins over the first or last day when they are too close.
    const kept = ticks.filter(
      (tick) => tick.index !== 0 || !near(0, todayIndex) || todayIndex === 0,
    );
    const trimmed = kept.filter(
      (tick) => tick.index !== last || !near(last, todayIndex),
    );
    trimmed.push({ index: todayIndex, today: true });
    return trimmed.sort((a, b) => a.index - b.index);
  }
  return ticks;
}
