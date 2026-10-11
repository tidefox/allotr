import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { SeriesColor } from '@/components/bars';
import { seriesBg, SkeletonTile } from '@/components/bars';
import { Grid, SectionTitle, Stack, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { EmptyState } from '@/components/states';
import { Chart, ChartLegend } from '@/charts/chart';
import { Sparkline } from '@/charts/sparkline';
import { Columns } from '@/charts/columns';
import { IconLineChartLine, IconPieChart2Line } from '@/generated/icons';
import { CategoryIcon } from '@/components/states';
import { seriesNumber } from '@/lib/category-style';
import { formatMoney } from '@/lib/format-money';
import { categoriesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { PeriodToolbar } from './period-menu.tsx';
import { ReportFailed, tabGridClass } from './summary-tab.tsx';
import { reportCategoriesQuery } from './summary-queries.ts';
import { reportParams } from './summary-model.ts';
import {
  TREND_PERIODS,
  hasSpending,
  totalsColumns,
  trendLines,
  versusRows,
} from './trends-model.ts';
import { useReportRange } from './use-report-range.ts';

const locale = 'en';

// Icon, name with the last period beside it, sparkline, movement.
const versusColumns = [
  { width: '1.125rem' },
  { width: 'minmax(0,1fr)' },
  { width: '3.75rem' },
  { width: 'auto' },
] as const;

function Shell({ children }: { children: ReactNode }) {
  return (
    <Stack className="min-h-full">
      <PeriodToolbar />
      <Grid className={tabGridClass}>{children}</Grid>
    </Stack>
  );
}

// Trends (docs/ui.md §6): category spending across the last periods, the
// selected period against the one before, and the total per period. Every
// figure comes from one `/v1/reports/categories?series=N` read.
export function TrendsTab() {
  const { period, range, ready } = useReportRange();
  const params = reportParams(period, range);
  const summary = useQuery({
    ...reportCategoriesQuery(params ?? { period: 'cycle' }, TREND_PERIODS),
    enabled: params !== null,
  });
  const categories = useQuery(categoriesQuery);

  if (ready && params === null) {
    return (
      <Shell>
        <Tile title={t('reportsShell.period.last-cycle')} span="full">
          <EmptyState
            title={t('reportsShell.period.last-cycle')}
            hint={t('reportsShell.noCycle')}
          />
        </Tile>
      </Shell>
    );
  }
  if (summary.isError) {
    return (
      <Shell>
        <Tile
          title={t('reportsSummary.trends.linesTitle')}
          icon={IconLineChartLine}
          span="full"
        >
          <ReportFailed
            retry={() => {
              void summary.refetch();
            }}
          />
        </Tile>
      </Shell>
    );
  }
  const series = summary.data?.series;
  if (!ready || series === undefined) {
    return (
      <Shell>
        <SkeletonTile span={2} rows={5} />
        <SkeletonTile rows={4} />
      </Shell>
    );
  }
  const cats = categories.data?.categories ?? [];
  if (!hasSpending(series)) {
    return (
      <Shell>
        <Tile
          title={t('reportsSummary.trends.linesTitle')}
          icon={IconLineChartLine}
          span="full"
        >
          <EmptyState
            title={t('reportsSummary.trends.emptyTitle')}
            hint={t('reportsSummary.trends.emptyHint')}
          />
        </Tile>
      </Shell>
    );
  }
  const count = series.periods.length;
  const unit = t(
    params?.period === 'month'
      ? 'reportsSummary.trends.perMonth'
      : 'reportsSummary.trends.perCycle',
  );
  const lines = trendLines(series, cats, locale);
  const shownIds = new Set(lines.series.map((s) => s.id));
  const versus = versusRows(series, cats).filter((row) =>
    shownIds.has(row.key),
  );
  const totals = totalsColumns(series, locale);
  const running = period === 'cycle' || period === 'month';
  return (
    <Shell>
      <Tile
        title={t('reportsSummary.trends.linesTitle')}
        icon={IconLineChartLine}
        subtitle={unit}
        span={2}
        bodyClassName="flex flex-col"
      >
        <Chart
          label={t('reportsSummary.trends.linesSummary', { count })}
          series={lines.series}
          yTicks={lines.yTicks}
          xTicks={lines.xTicks}
          table={lines.table}
          height={170}
          grow
          className="px-0"
        />
        <ChartLegend
          items={[
            ...lines.series.map((s) => ({
              label: s.label,
              mark: 'line' as const,
              color: seriesBg[s.color as SeriesColor],
            })),
            ...(lines.leftOut === null
              ? []
              : [
                  {
                    label: t('reportsSummary.trends.leftOut', {
                      name: lines.leftOut.name,
                      amount: formatMoney(
                        lines.leftOut.amount,
                        'symbol',
                        locale,
                      ),
                    }),
                    mark: 'none' as const,
                  },
                ]),
          ]}
        />
      </Tile>
      <Tile
        title={t('reportsSummary.trends.vsTitle')}
        icon={IconPieChart2Line}
        subtitle={t('reportsSummary.trends.vsSubtitle')}
        bodyClassName="flex flex-col px-0 pb-2.5"
      >
        {versus.map((row) => (
          <Row
            key={row.key}
            columns={versusColumns}
            cells={[
              row.icon === null ? null : (
                <CategoryIcon
                  name={row.icon}
                  color={seriesNumber(row.colour)}
                />
              ),
              <span key="n" className="font-sans">
                {row.name}
                {row.previous === null ? null : (
                  <span className="text-text-muted">
                    {' '}
                    {t('reportsSummary.trends.last', {
                      amount: formatMoney(row.previous, 'symbol', locale),
                    })}
                  </span>
                )}
              </span>,
              <Sparkline
                key="s"
                points={row.points}
                color={row.colour}
                className="h-1.5"
                label={t('reportsSummary.trends.sparkLabel', {
                  name: row.name,
                })}
              />,
              row.movement === null ? null : (
                <span
                  key="m"
                  className={cn(
                    'num block text-right',
                    row.movement === 'up' && 'text-negative',
                    row.movement === 'down' && 'text-positive',
                    row.movement === 'same' && 'text-text-muted',
                  )}
                >
                  {row.movement === 'up'
                    ? `↑ ${t('reportsSummary.trends.up')}`
                    : row.movement === 'down'
                      ? `↓ ${t('reportsSummary.trends.down')}`
                      : `↔ ${t('reportsSummary.trends.same')}`}
                </span>
              ),
            ]}
          />
        ))}
        <div className="px-3">
          <SectionTitle>{t('reportsSummary.trends.totalsTitle')}</SectionTitle>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3">
          <Columns
            height={120}
            data={totals.columns}
            label={t('reportsSummary.trends.totalsSummary', { count })}
          />
          {running ? (
            <ChartLegend
              items={[
                {
                  label: t('reportsSummary.trends.inProgress', {
                    period:
                      totals.columns[totals.columns.length - 1]?.xLabel ?? '',
                  }),
                  mark: 'none',
                },
              ]}
            />
          ) : null}
        </div>
        {/* A table ignores its own size, so the wrapper hides it. */}
        <div className="sr-only">
          <table>
            <caption>{t('reportsSummary.trends.totalsCaption')}</caption>
            <thead>
              <tr>
                <th>{t('reportsSummary.trends.period')}</th>
                <th>{t('reportsSummary.trends.spent')}</th>
              </tr>
            </thead>
            <tbody>
              {totals.rows.map((cells) => (
                <tr key={cells[0]}>
                  {cells.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tile>
    </Shell>
  );
}
