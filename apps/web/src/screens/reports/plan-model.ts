import {
  money,
  type CycleSummaryView,
  type NetWorthView,
} from '@allotr/shared';
import type { ChartTick } from '@/charts/chart';
import type { ColumnDatum } from '@/charts/columns';
import { niceTicks, type Point } from '@/charts/math';
import { formatTerminalDate } from '@/features/today/format';
import { formatMoneyShort } from '@/lib/format-money';
import { t } from '@/messages/t';
import { formatRate, fractionsOf } from './cycles-model.ts';

// What the plan tab shows besides the budget tree: the savings rate per
// cycle and the net worth line. All amounts are the server's; fractions and
// tick positions only size and place marks.

function rateText(cycle: CycleSummaryView): string {
  return cycle.savingsRate === null
    ? t('reportsPlan.rate.none')
    : formatRate(cycle.savingsRate);
}

/**
 * One column per cycle: the server's savings rate. A loss has no bar. The
 * open cycle is `primary`, closed ones `positive`.
 */
export function rateColumns(
  cycles: readonly CycleSummaryView[],
  locale: string,
): ColumnDatum[] {
  const fractions = fractionsOf(cycles.map((c) => c.savingsRate ?? 0));
  return cycles.map((cycle, i) => ({
    id: cycle.openedOn,
    fraction: fractions[i] ?? 0,
    valueLabel: rateText(cycle),
    xLabel: formatTerminalDate(cycle.openedOn, locale),
    color: cycle.closedOn === null ? 'primary' : 'positive',
  }));
}

export type WorthChart = Readonly<{
  points: readonly Point[];
  yTicks: readonly ChartTick[];
  xTicks: readonly ChartTick[];
}>;

/** The net worth line with a gridline every round step and four x labels. */
export function worthChart(
  series: NetWorthView['series'],
  locale: string,
): WorthChart {
  const points = series.map((p, x) => ({ x, y: p.amount.amountMinor }));
  const first = series[0];
  if (first === undefined) return { points, yTicks: [], xTicks: [] };
  const low = Math.min(...points.map((p) => p.y));
  const high = Math.max(...points.map((p) => p.y));
  const yTicks = niceTicks(low, high, 4).map((value) => ({
    value,
    label: formatMoneyShort(money(value, first.amount.currency), locale),
  }));
  const last = series.length - 1;
  const xs = [
    ...new Set([0, Math.round(last / 3), Math.round((last * 2) / 3), last]),
  ];
  const xTicks = xs.map((value) => ({
    value,
    label: formatTerminalDate(series[value]?.date ?? first.date, locale),
  }));
  return { points, yTicks, xTicks };
}
