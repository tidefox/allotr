import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Grid, Stack, Tile } from '@/components/layout';
import type { RowColumn } from '@/components/row-columns';
import { EmptyState } from '@/components/states';
import { Chart, ChartLegend } from '@/charts/chart';
import { Columns } from '@/charts/columns';
import { formatDay, formatTerminalDate } from '@/features/today/format';
import {
  IconLineChartLine,
  IconPieChart2Line,
  IconSafe2Line,
} from '@/generated/icons';
import { formatMoney } from '@/lib/format-money';
import { budgetsQuery } from '@/lib/budgets';
import { categoriesQuery, cyclesQuery } from '@/lib/ledger';
import { netWorthQuery } from '@/lib/plan';
import { t } from '@/messages/t';
import { worthDays } from '@/features/net-worth/model';
import { BudgetLine } from '../budget/budget-line.tsx';
import { budgetRows, periodPace } from '../dashboard/tiles/budgets.ts';
import { recentCycles } from './cycles-model.ts';
import { PeriodToolbar } from './period-menu.tsx';
import { rateColumns, worthChart } from './plan-model.ts';
import { tabGridClass } from './summary-tab.tsx';
import { useReportRange } from './use-report-range.ts';

const locale = 'en';

function Failed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 py-2 text-small">
      <span className="text-negative">{t('reportsPlan.loadFailed')}</span>
      <BracketButton onPress={retry}>{t('reportsPlan.retry')}</BracketButton>
    </div>
  );
}

// Plan (docs/ui.md §6): budgets against what was spent, the savings rate per
// cycle and net worth over the period. Figures are the server's. The period
// menu sets the net worth span; budgets are always the current period and
// the rates cover the newest cycles.
export function PlanTab() {
  return (
    <Stack className="min-h-full">
      <PeriodToolbar />
      <Grid className={tabGridClass}>
        <BudgetTile />
        <RateTile />
        <NetWorthTile />
      </Grid>
    </Stack>
  );
}

// Lead, icon, name, bar, spent, left; phones drop the spent column and
// narrow the bar, as left is the figure to act on (the budget rows of the
// locked design, without actions).
const budgetColumns: readonly RowColumn[] = [
  { width: '1.5rem' },
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'minmax(3.75rem, 2.4fr)', at: { compact: 'minmax(2.25rem, 1fr)' } },
  { width: '9ch', from: 'medium' },
  { width: '9ch' },
];

function BudgetTile() {
  const status = useQuery(budgetsQuery);
  const categories = useQuery(categoriesQuery);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(
    () =>
      status.data === undefined
        ? []
        : budgetRows(status.data, categories.data?.categories ?? []),
    [status.data, categories.data],
  );
  const shown = rows.filter(
    (row) =>
      (row.role !== 'child' && row.role !== 'last-child') ||
      !folded.has(row.group),
  );
  const pace = status.data === undefined ? null : periodPace(status.data);
  return (
    <Tile
      title={t('reportsPlan.budget.title')}
      icon={IconPieChart2Line}
      span={2}
      bodyClassName="px-0 pb-0"
    >
      {status.isError ? (
        <div className="px-3">
          <Failed
            retry={() => {
              void status.refetch();
            }}
          />
        </div>
      ) : status.data === undefined ? (
        <div className="px-3">
          <SkeletonTile rows={4} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('reportsPlan.budget.emptyTitle')}
          hint={t('reportsPlan.budget.emptyHint')}
        />
      ) : (
        <>
          {shown.map((row) => (
            <BudgetLine
              key={row.id}
              row={row}
              pace={pace?.fraction}
              expanded={!folded.has(row.group)}
              onToggle={() => {
                setFolded((current) => {
                  const next = new Set(current);
                  if (!next.delete(row.group)) next.add(row.group);
                  return next;
                });
              }}
              foldLabel={t('budgetBudgets.tree.fold', { name: row.name })}
              setAsideLabel={t('budgetBudgets.tree.setAside')}
              barLabel={t('reportsPlan.budget.barLabel', { name: row.name })}
              columns={budgetColumns}
              className="border-b-0"
            />
          ))}
          {pace === null ? null : (
            <ChartLegend
              className="px-3"
              items={[
                {
                  label: t('budgetBudgets.tree.pace', {
                    day: pace.day,
                    length: pace.length,
                  }),
                  mark: 'tick',
                  color: 'bg-text',
                },
              ]}
            />
          )}
        </>
      )}
    </Tile>
  );
}

function RateTile() {
  const cycles = useQuery(cyclesQuery);
  const list = cycles.data?.cycles;
  const open = list?.[0];
  return (
    <Tile
      title={t('reportsPlan.rate.title')}
      icon={IconSafe2Line}
      subtitle={t('reportsPlan.rate.subtitle')}
      bodyClassName="flex flex-col"
    >
      {cycles.isError ? (
        <Failed
          retry={() => {
            void cycles.refetch();
          }}
        />
      ) : list === undefined ? (
        <SkeletonTile />
      ) : list.length === 0 ? (
        <EmptyState
          title={t('reportsPlan.rate.emptyTitle')}
          hint={t('reportsPlan.rate.emptyHint')}
        />
      ) : (
        <>
          <Columns
            height={130}
            label={t('reportsPlan.rate.summary')}
            data={rateColumns(recentCycles(list), locale)}
          />
          {open === undefined || open.closedOn !== null ? null : (
            <ChartLegend
              items={[
                {
                  label: t('reportsPlan.rate.inProgress', {
                    cycle: formatTerminalDate(open.openedOn, locale),
                  }),
                  mark: 'none',
                },
              ]}
            />
          )}
        </>
      )}
    </Tile>
  );
}

function NetWorthTile() {
  const { range, today, ready } = useReportRange();
  const days =
    ready && today !== undefined && range !== null
      ? worthDays(range.from, today)
      : undefined;
  const worth = useQuery({
    ...netWorthQuery(days ?? 30),
    enabled: days !== undefined,
  });
  const data = worth.data;
  const first = data?.series[0];
  const last = data?.series[data.series.length - 1];
  const chart =
    data === undefined ? undefined : worthChart(data.series, locale);
  return (
    <Tile
      title={t('reportsPlan.netWorth.title')}
      icon={IconLineChartLine}
      span="full"
      bodyClassName="flex flex-col"
    >
      {ready && range === null ? (
        <EmptyState
          title={t('reportsPlan.netWorth.emptyTitle')}
          hint={t('reportsShell.noCycle')}
        />
      ) : worth.isError ? (
        <Failed
          retry={() => {
            void worth.refetch();
          }}
        />
      ) : data === undefined || chart === undefined ? (
        <SkeletonTile />
      ) : first === undefined || last === undefined ? (
        <EmptyState
          title={t('reportsPlan.netWorth.emptyTitle')}
          hint={t('reportsPlan.netWorth.emptyHint')}
        />
      ) : (
        <Chart
          label={t('reportsPlan.netWorth.summary', {
            days: data.series.length,
            end: formatMoney(data.amount, 'symbol', locale),
            change: formatMoney(data.change, 'symbol', locale),
          })}
          series={[
            {
              id: 'net-worth',
              label: t('reportsPlan.netWorth.total'),
              color: 'series-1',
              points: chart.points,
              area: true,
              endLabel: formatMoney(last.amount, 'symbol', locale),
            },
          ]}
          yTicks={chart.yTicks}
          xTicks={chart.xTicks}
          height={170}
          grow
          className="px-0"
          table={{
            caption: t('reportsPlan.netWorth.caption'),
            headers: [
              t('reportsPlan.netWorth.day'),
              t('reportsPlan.netWorth.total'),
            ],
            rows: data.series.map((p) => [
              formatDay(p.date, locale),
              formatMoney(p.amount, 'symbol', locale),
            ]),
          }}
        />
      )}
    </Tile>
  );
}
