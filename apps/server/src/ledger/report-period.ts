import { cyclesOf, type LedgerView } from '@allotr/core';
import {
  addDays,
  lastDayOfMonth,
  localDate,
  type LocalDate,
} from '@allotr/shared';
import { RequestProblem } from './domain-errors.ts';

// The period a report covers, resolved the same way for every report: a
// payday cycle (by the day it opened, else the one that holds today) or a
// calendar month (`YYYY-MM`, else this one). An open cycle runs to today.

export type ReportPeriodQuery = Readonly<{
  period: 'cycle' | 'month';
  cycle?: LocalDate | undefined;
  month?: string | undefined;
}>;

type Cycle = ReturnType<typeof cyclesOf>[number];

export type ReportPeriod = Readonly<{
  /** First day, inclusive. */
  from: LocalDate;
  /** Last day, inclusive. */
  to: LocalDate;
}> &
  (
    | Readonly<{ kind: 'month'; month: string }>
    | Readonly<{ kind: 'cycle'; cycle: Cycle; cycles: readonly Cycle[] }>
  );

export function resolveReportPeriod(
  view: LedgerView,
  today: LocalDate,
  query: ReportPeriodQuery,
): ReportPeriod {
  if (query.period === 'month') {
    const month = query.month ?? today.slice(0, 7);
    const from = localDate(`${month}-01`);
    return { kind: 'month', month, from, to: lastDayOfMonth(from) };
  }
  const cycles = cyclesOf(view, today);
  const cycle =
    query.cycle === undefined
      ? cycles.at(-1)
      : cycles.find((c) => c.openedOn === query.cycle);
  if (cycle === undefined) {
    throw new RequestProblem(
      404,
      'cycle_not_found',
      `No cycle opened on ${query.cycle ?? 'that day'}.`,
    );
  }
  return {
    kind: 'cycle',
    cycle,
    cycles,
    from: cycle.openedOn,
    to: cycle.closedOn === null ? today : addDays(cycle.closedOn, -1),
  };
}
