import {
  money,
  type CategoryIcon,
  type CategorySeriesView,
  type CategoryView,
  type Money,
} from '@allotr/shared';
import type { SeriesColor } from '@/components/bars';
import type { ChartSeries, ChartTable, ChartTick } from '@/charts/chart';
import type { ColumnDatum } from '@/charts/columns';
import type { Point } from '@/charts/math';
import { niceTicks } from '@/charts/math';
import { formatTerminalDate } from '@/features/today/format';
import { categoryStyles } from '@/lib/category-style';
import { formatMoney, formatMoneyShort } from '@/lib/format-money';
import { t } from '@/messages/t';
import { fractionOf } from './summary-model.ts';

// The trends tab's view model: category spending across consecutive
// periods, as the server summed them. Nothing is added up here. Amounts
// are looked up, compared and formatted; positions are fractions or axis
// ticks, never amounts anyone is told they have.

/** How many periods the trends look back, the selected one included. */
export const TREND_PERIODS = 6;

/** The categories drawn as lines; the rest stay in the table. */
export const TREND_LINES = 3;

const NO_CATEGORY_COLOUR: SeriesColor = 'series-8';

function currencyOf(series: CategorySeriesView) {
  return series.totals[0]?.currency;
}

function nameOf(id: string | null, names: ReadonlyMap<string, string>) {
  return (
    (id === null ? undefined : names.get(id)) ??
    t('reportsSummary.categories.none')
  );
}

/** A period's first day as the axis label. */
export function periodLabels(
  series: CategorySeriesView,
  locale: string,
): string[] {
  return series.periods.map((p) => formatTerminalDate(p.from, locale));
}

/** At most `max` tick positions across `count` points, first and last kept. */
export function tickIndexes(count: number, max = 6): number[] {
  if (count <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return [
    ...new Set(Array.from({ length: max }, (_, i) => Math.round(i * step))),
  ];
}

export interface TrendLines {
  series: ChartSeries[];
  /**
   * The largest category when it dwarfs the rest (more than twice the
   * next one's highest): it would flatten every other line, so it stays out
   * of the scale and is named under the chart. Its latest figure is the
   * server's.
   */
  leftOut: { name: string; amount: Money } | null;
  yTicks: ChartTick[];
  xTicks: ChartTick[];
  table: ChartTable;
}

/** The largest categories as lines, one point per period. */
export function trendLines(
  series: CategorySeriesView,
  categories: readonly CategoryView[],
  locale: string,
  limit = TREND_LINES,
): TrendLines {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const styles = categoryStyles(categories);
  const labels = periodLabels(series, locale);
  const peakOf = (g: CategorySeriesView['groups'][number]) =>
    g.points.reduce((a, p) => Math.max(a, p.amountMinor), 0);
  const [first, second] = series.groups;
  const dwarfs =
    first !== undefined &&
    second !== undefined &&
    peakOf(first) > 2 * peakOf(second);
  const leftOutGroup = dwarfs ? first : undefined;
  const shown = series.groups.slice(dwarfs ? 1 : 0, (dwarfs ? 1 : 0) + limit);
  const lastPoint = (g: CategorySeriesView['groups'][number]) =>
    g.points[g.points.length - 1];
  const lines = shown.map((group): ChartSeries => {
    const id = group.categoryId ?? 'none';
    const end = lastPoint(group);
    return {
      id,
      label: nameOf(group.categoryId, names),
      color:
        (group.categoryId === null
          ? undefined
          : styles.get(group.categoryId)?.colour) ?? NO_CATEGORY_COLOUR,
      points: group.points.map((p, x) => ({ x, y: p.amountMinor })),
      ...(end === undefined
        ? {}
        : { endLabel: formatMoney(end, 'symbol', locale) }),
    };
  });
  const high = lines
    .flatMap((l) => l.points.map((p) => p.y))
    .reduce((a, b) => Math.max(a, b), 0);
  const currency = currencyOf(series);
  const leftOutLast =
    leftOutGroup === undefined ? undefined : lastPoint(leftOutGroup);
  return {
    series: lines,
    leftOut:
      leftOutGroup === undefined || leftOutLast === undefined
        ? null
        : {
            name: nameOf(leftOutGroup.categoryId, names),
            amount: leftOutLast,
          },
    // Axis positions, rounded; not amounts anyone is told they have.
    yTicks:
      currency === undefined
        ? []
        : niceTicks(0, high, 5).map((value) => ({
            value,
            label: formatMoneyShort(money(value, currency), locale),
          })),
    xTicks: tickIndexes(labels.length).map((value) => ({
      value,
      label: labels[value] ?? '',
    })),
    table: {
      caption: t('reportsSummary.trends.linesCaption'),
      headers: [
        t('reportsSummary.trends.period'),
        ...shown.map((g) => nameOf(g.categoryId, names)),
      ],
      rows: series.periods.map((_, i) => [
        labels[i] ?? '',
        ...shown.map((g) => {
          const point = g.points[i];
          return point === undefined
            ? ''
            : formatMoney(point, 'symbol', locale);
        }),
      ]),
    },
  };
}

export type Movement = 'up' | 'down' | 'same';

export interface VersusRow {
  key: string;
  name: string;
  colour: SeriesColor;
  icon: CategoryIcon | null;
  /** The selected period's spending. */
  current: Money;
  /** The server's mean over every period in the series, this one included. */
  average: Money;
  /** This period against the average; null with a single period. */
  movement: Movement | null;
  /** The category's spending in every period, oldest first, for a sparkline. */
  points: readonly Point[];
}

/**
 * The selected period against the average over all periods, per category,
 * by comparison only: the average is the server's (`average`), and the
 * percentage in the locked design stays out because the browser may not
 * compute one.
 */
export function versusRows(
  series: CategorySeriesView,
  categories: readonly CategoryView[],
): VersusRow[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const styles = categoryStyles(categories);
  const last = series.periods.length - 1;
  return series.groups.flatMap((group): VersusRow[] => {
    const current = group.points[last];
    if (current === undefined) return [];
    if (current.amountMinor === 0 && group.average.amountMinor === 0) return [];
    return [
      {
        key: group.categoryId ?? 'none',
        name: nameOf(group.categoryId, names),
        colour:
          (group.categoryId === null
            ? undefined
            : styles.get(group.categoryId)?.colour) ?? NO_CATEGORY_COLOUR,
        icon:
          (group.categoryId === null
            ? undefined
            : styles.get(group.categoryId)?.icon) ?? null,
        current,
        average: group.average,
        points: group.points.map((p, x) => ({ x, y: p.amountMinor })),
        movement:
          last === 0
            ? null
            : current.amountMinor > group.average.amountMinor
              ? 'up'
              : current.amountMinor < group.average.amountMinor
                ? 'down'
                : 'same',
      },
    ];
  });
}

export interface TotalsChart {
  columns: ColumnDatum[];
  rows: string[][];
}

/** Total spent per period; the selected (last) period in a second colour. */
export function totalsColumns(
  series: CategorySeriesView,
  locale: string,
): TotalsChart {
  const labels = periodLabels(series, locale);
  const peak = series.totals.reduce(
    (max, m) => Math.max(max, m.amountMinor),
    0,
  );
  const last = series.totals.length - 1;
  return {
    columns: series.totals.map((total, i) => ({
      id: series.periods[i]?.from ?? String(i),
      fraction: fractionOf(total.amountMinor, peak),
      valueLabel: formatMoneyShort(total, locale),
      xLabel: labels[i] ?? '',
      color: i === last ? ('series-4' as const) : ('primary' as const),
    })),
    rows: series.totals.map((total, i) => [
      labels[i] ?? '',
      formatMoney(total, 'symbol', locale),
    ]),
  };
}

/** Whether any period in the series had spending. */
export function hasSpending(series: CategorySeriesView): boolean {
  return series.totals.some((m) => m.amountMinor > 0);
}
