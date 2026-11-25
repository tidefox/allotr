import type { LocalDate } from '@allotr/shared';
import type { Period } from './search-params.ts';

// The dates a period covers, as the `from` and `to` of the list query. Dates
// only, never money. A period that cannot be placed yet (the first cycle has
// no cycle before it) is `null`, which the screen shows as an empty range.

export interface DateRange {
  from?: LocalDate;
  to?: LocalDate;
}

export interface CycleBounds {
  openedOn: LocalDate;
  lastDay: LocalDate;
  /** The paycheck that opened it; null for the first cycle. */
  openedBy?: string | null;
}

/**
 * Where a cycle period starts and stops within its paycheck days: a paycheck
 * cuts its day, so the dates alone would list entries from before it in the
 * new cycle (ADR 0039).
 */
export function periodEntries(
  period: Period,
  cycles: readonly CycleBounds[],
): { fromEntry?: string; beforeEntry?: string } {
  const [open, last] = cycles;
  const cut = (c: CycleBounds | undefined) => c?.openedBy ?? undefined;
  if (period === 'cycle') return withDefined({ fromEntry: cut(open) });
  if (period === 'last-cycle') {
    return withDefined({ fromEntry: cut(last), beforeEntry: cut(open) });
  }
  return {};
}

function withDefined(bounds: {
  fromEntry?: string | undefined;
  beforeEntry?: string | undefined;
}): { fromEntry?: string; beforeEntry?: string } {
  return Object.fromEntries(
    Object.entries(bounds).filter(([, v]) => v !== undefined),
  );
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The whole calendar month `offset` months from the one `today` is in. */
export function monthRange(today: LocalDate, offset: 0 | -1): DateRange {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) + offset;
  const y = month < 1 ? year - 1 : year;
  const m = month < 1 ? 12 : month;
  return {
    from: `${String(y)}-${pad(m)}-01` as LocalDate,
    to: `${String(y)}-${pad(m)}-${pad(daysIn(y, m))}` as LocalDate,
  };
}

/**
 * `cycles` is newest first, the open cycle first. The open cycle has no end
 * yet, so it runs from its opening day with no `to`.
 */
export function periodRange(
  period: Period,
  today: LocalDate,
  cycles: readonly CycleBounds[],
): DateRange | null {
  switch (period) {
    case 'all':
      return {};
    case 'month':
      return monthRange(today, 0);
    case 'last-month':
      return monthRange(today, -1);
    case 'cycle': {
      const open = cycles[0];
      return open === undefined ? {} : { from: open.openedOn };
    }
    case 'last-cycle': {
      const last = cycles[1];
      return last === undefined
        ? null
        : { from: last.openedOn, to: last.lastDay };
    }
  }
}
