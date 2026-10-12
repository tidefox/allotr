import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { localDate, type Money } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { formatMoney } from '@/lib/format-money';
import { Bar, seriesBg, ShareBar, SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Grid, Stack, Tile } from '@/components/layout';
import { Row, TreeRow } from '@/components/row';
import { CategoryIcon, EmptyState } from '@/components/states';
import { Stats, type Stat } from '@/components/stats';
import { ChartLegend } from '@/charts/chart';
import { Columns } from '@/charts/columns';
import {
  IconBarChartBoxLine,
  IconCalendar2Line,
  IconFileList3Line,
  IconMoneyDollarCircleLine,
  IconPieChart2Line,
  IconSafe2Line,
} from '@/generated/icons';
import { budgetsQuery } from '@/lib/budgets';
import {
  calendarQuery,
  categoriesQuery,
  cycleDaysQuery,
  cyclesQuery,
  todayQuery,
} from '@/lib/ledger';
import { formatRate } from './cycles-model.ts';
import { periodPace } from '../dashboard/tiles/budgets.ts';
import { seriesNumber } from '@/lib/category-style';
import { t } from '@/messages/t';
import { shareText } from '@/lib/share-text';
import { PeriodToolbar } from './period-menu.tsx';
import type { ReportPeriod } from './reports-search.ts';
import { reportPayeesQuery, reportCategoriesQuery } from './summary-queries.ts';
import {
  budgetsByCategory,
  categoryRows,
  cycleDayFigures,
  cycleOf,
  dayChart,
  fractionOf,
  monthDayFigures,
  reportParams,
  shareSegments,
  statFigures,
  visibleRows,
  type CategoryRow,
  type ReportParams,
} from './summary-model.ts';
import { useReportRange } from './use-report-range.ts';

const locale = 'en';
// Only a placeholder key for the month read, which waits until dates exist.
const FALLBACK_DAY = localDate('2000-01-01');

// Lead is added by the row; icon, name, bar, spent, budget, share. Phones
// drop the budget column and narrow the bar, as the locked design does.
const categoryColumns = [
  { width: '1.125rem' },
  { width: 'minmax(0,1fr)' },
  { width: 'minmax(3.125rem,1.8fr)', at: { compact: 'minmax(1.875rem,1fr)' } },
  { width: '11ch', at: { compact: '10ch' } },
  { width: '10ch', from: 'medium' },
  { width: '5ch', at: { compact: '4ch' } },
] as const;

const payeeColumns = [
  { width: 'minmax(0,1fr)' },
  { width: '4ch' },
  { width: 'auto' },
] as const;

/** A tile body for a failed read, with a retry. */
export function ReportFailed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 py-2 text-small">
      <span className="text-negative">{t('reportsSummary.loadFailed')}</span>
      <BracketButton onPress={retry}>{t('reportsSummary.retry')}</BracketButton>
    </div>
  );
}

// The sub-tab's stack: the toolbar, then stats and tiles whose seams are
// the stack's own.
export const tabGridClass = 'border-t-0 border-l-0';

// Summary (docs/ui.md §6): the period's figures, spending by category, top
// payees and spending per day. Every amount is the server's.
export function SummaryTab() {
  const { period, range, ready } = useReportRange();
  const params = reportParams(period, range);
  if (ready && params === null) {
    return (
      <Stack className="min-h-full">
        <PeriodToolbar />
        <Grid className={tabGridClass}>
          <Tile title={t('reportsShell.period.last-cycle')} span="full">
            <EmptyState
              title={t('reportsShell.period.last-cycle')}
              hint={t('reportsShell.noCycle')}
            />
          </Tile>
        </Grid>
      </Stack>
    );
  }
  if (!ready || params === null) {
    return (
      <Stack className="min-h-full">
        <PeriodToolbar />
        <Grid className={tabGridClass}>
          <SkeletonTile span="full" />
          <SkeletonTile span={2} rows={5} />
          <SkeletonTile rows={4} />
        </Grid>
      </Stack>
    );
  }
  return (
    <Stack className="min-h-full">
      <PeriodToolbar />
      <StatsRow params={params} />
      <Grid className={tabGridClass}>
        <CategoriesTile params={params} />
        <PayeesTile params={params} period={period} />
        <DaysTile params={params} />
      </Grid>
    </Stack>
  );
}

function StatsRow({ params }: { params: ReportParams }) {
  const { period } = useReportRange();
  const cycles = useQuery(cyclesQuery);
  const today = useQuery(todayQuery);
  const summary = useQuery(reportCategoriesQuery(params, 1));
  if (cycles.data === undefined || summary.data === undefined) {
    return <SkeletonTile span="full" rows={2} />;
  }
  const cycle = cycleOf(period, cycles.data.cycles);
  const figures = statFigures(cycle, summary.data);
  const missing =
    figures.missingRates.length === 0
      ? {}
      : {
          sub: t('reportsSummary.stats.missingRates', {
            currencies: figures.missingRates.join(', '),
          }),
        };
  const money = (amount: Money) => <Amount amount={amount} locale={locale} />;
  // The open cycle's allocation and daily number; a closed period has none.
  const running = period === 'cycle' ? today.data : undefined;
  const rate = cycle?.savingsRate ?? null;
  const stats: Stat[] = [
    {
      label: t('reportsSummary.stats.spent', {
        period: t(`reportsShell.period.${period}`),
      }),
      icon: IconBarChartBoxLine,
      figure: money(figures.spent),
      tone: 'primary',
      ...(running === undefined
        ? {}
        : {
            sub: t('reportsSummary.stats.inclBills', {
              amount: formatMoney(
                running.allocation.paidBills,
                'symbol',
                locale,
              ),
            }),
          }),
      ...missing,
    },
    {
      label: t('reportsSummary.stats.income'),
      icon: IconMoneyDollarCircleLine,
      figure: money(figures.income),
      figureTone: 'positive',
      ...missing,
    },
    ...(figures.otherInflows.amountMinor === 0
      ? []
      : [
          {
            label: t('reportsSummary.stats.otherInflows'),
            icon: IconMoneyDollarCircleLine,
            figure: money(figures.otherInflows),
            sub: t('reportsSummary.stats.otherInflowsSub'),
            ...missing,
          },
        ]),
    ...(figures.outside.amountMinor === 0
      ? []
      : [
          {
            label: t('reportsSummary.stats.outside'),
            icon: IconBarChartBoxLine,
            figure: money(figures.outside),
            sub: t('reportsSummary.stats.outsideSub'),
            ...missing,
          },
        ]),
    {
      label: t('reportsSummary.stats.saved'),
      icon: IconSafe2Line,
      // A cycle carries the server's rate; a month has only the amount.
      figure: rate === null ? money(figures.saved) : formatRate(rate),
      ...(rate === null
        ? {}
        : {
            sub: t('reportsSummary.stats.toSavings', {
              amount: formatMoney(figures.saved, 'symbol', locale),
            }),
            bar: {
              fraction: Math.max(0, rate) / 10000,
              label: t('reportsSummary.stats.savedBar'),
            },
          }),
      ...missing,
    },
    {
      label: t('reportsSummary.stats.average'),
      icon: IconCalendar2Line,
      figure: money(figures.average),
      ...(running === undefined
        ? {}
        : {
            sub: t('reportsSummary.stats.dailyNumber', {
              amount: formatMoney(running.todayAllowance, 'symbol', locale),
            }),
            bar: {
              fraction: fractionOf(
                figures.average.amountMinor,
                running.todayAllowance.amountMinor,
              ),
              label: t('reportsSummary.stats.averageBar'),
              fillClassName: 'bg-primary',
            },
          }),
      ...missing,
    },
  ];
  return <Stats stats={stats} className={tabGridClass} />;
}

function CategoriesTile({ params }: { params: ReportParams }) {
  const { period } = useReportRange();
  const summary = useQuery(reportCategoriesQuery(params, 1));
  const categories = useQuery(categoriesQuery);
  const budgets = useQuery(budgetsQuery);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(
    () =>
      summary.data === undefined
        ? []
        : categoryRows(
            summary.data,
            summary.data.spendingTotal,
            categories.data?.categories ?? [],
            budgetsByCategory(
              budgets.data?.budgets ?? [],
              budgets.data?.parents ?? [],
              period,
              budgets.data?.periodRule ?? 'cycle',
            ),
          ),
    [summary.data, categories.data, budgets.data, period],
  );
  if (summary.isError) {
    return (
      <Tile
        title={t('reportsSummary.categories.title')}
        icon={IconPieChart2Line}
        span={2}
      >
        <ReportFailed
          retry={() => {
            void summary.refetch();
          }}
        />
      </Tile>
    );
  }
  if (summary.data === undefined) return <SkeletonTile span={2} rows={5} />;
  const shown = visibleRows(rows, folded);
  const groups = [
    ...new Set(rows.filter((r) => r.role === 'parent').map((r) => r.group)),
  ];
  const allFolded = groups.length > 0 && groups.every((g) => folded.has(g));
  const toggle = (group: string) => {
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });
  };
  // The even-pace tick only means something against this period's budgets.
  const pace =
    budgets.data === undefined || !rows.some((r) => r.budget !== null)
      ? null
      : periodPace(budgets.data);
  return (
    <Tile
      title={t('reportsSummary.categories.title')}
      icon={IconPieChart2Line}
      subtitle={t('reportsSummary.categories.subtitle')}
      span={2}
      bodyClassName="px-0 pb-0"
      actions={
        groups.length === 0 ? undefined : (
          <BracketButton
            onPress={() => {
              setFolded(allFolded ? new Set() : new Set(groups));
            }}
          >
            {allFolded
              ? t('reportsSummary.categories.expandAll')
              : t('reportsSummary.categories.collapseAll')}
          </BracketButton>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title={t('reportsSummary.categories.emptyTitle')}
          hint={t('reportsSummary.categories.emptyHint')}
        />
      ) : (
        <>
          <div className="px-3 pb-2.5">
            <ShareBar
              className="h-3.5"
              segments={shareSegments(rows)}
              label={t('reportsSummary.categories.share')}
            />
          </div>
          {shown.map((row) => (
            <CategoryLine
              key={row.key}
              row={row}
              pace={pace?.fraction}
              folded={folded.has(row.group)}
              onToggle={() => {
                toggle(row.group);
              }}
            />
          ))}
          {pace === null ? null : (
            <ChartLegend
              className="px-3"
              items={[
                {
                  label: t('reportsSummary.categories.pace', {
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

function CategoryLine({
  row,
  pace,
  folded,
  onToggle,
}: {
  row: CategoryRow;
  pace: number | undefined;
  folded: boolean;
  onToggle: () => void;
}) {
  const share = shareText(row.shareBp);
  const cells = [
    row.icon === null ? (
      <span key="icon" aria-hidden="true" className="block size-4" />
    ) : (
      <CategoryIcon
        key="icon"
        name={row.icon}
        color={seriesNumber(row.colour)}
      />
    ),
    <span key="name" className="font-sans">
      {row.name}
    </span>,
    row.budget === null ? (
      <span key="bar" className="text-tiny text-text-muted">
        {t('reportsSummary.categories.noBudget')}
      </span>
    ) : (
      // Room for the pace tick, which reaches past the track.
      <div key="bar" className="py-[3px]">
        <Bar
          value={row.budgetFraction}
          over={row.over}
          pace={pace}
          fillClassName={seriesBg[row.colour]}
          label={t('reportsSummary.categories.barLabel', {
            name: row.name,
            share,
          })}
        />
      </div>
    ),
    <span key="spent" className="block text-right">
      <Amount amount={row.amount} locale={locale} />
    </span>,
    row.budget === null ? (
      <span key="budget" className="block text-right text-text-muted">
        —
      </span>
    ) : (
      <span key="budget" className="block text-right text-text-muted">
        <Amount amount={row.budget} locale={locale} />
      </span>
    ),
    <span key="share" className="num block text-right text-text-muted">
      {share}
    </span>,
  ];
  if (row.role === 'flat') {
    return (
      <Row
        columns={[{ width: '1.5rem' }, ...categoryColumns]}
        cells={[null, ...cells]}
      />
    );
  }
  return (
    <TreeRow
      role={row.role}
      expanded={!folded}
      onToggle={onToggle}
      label={t('reportsSummary.categories.fold', { name: row.name })}
      columns={categoryColumns}
      cells={cells}
      {...(row.role === 'parent' ? { className: 'font-semibold' } : {})}
    />
  );
}

function PayeesTile({
  params,
  period,
}: {
  params: ReportParams;
  period: ReportPeriod;
}) {
  const navigate = useNavigate();
  const payees = useQuery(reportPayeesQuery(params));
  if (payees.isError) {
    return (
      <Tile title={t('reportsSummary.payees.title')} icon={IconFileList3Line}>
        <ReportFailed
          retry={() => {
            void payees.refetch();
          }}
        />
      </Tile>
    );
  }
  if (payees.data === undefined) return <SkeletonTile rows={4} />;
  const sections = payees.data.currencies.filter(
    (c) => c.payees.length > 0 || c.unnamed !== null,
  );
  const several = sections.length > 1;
  return (
    <Tile
      title={t('reportsSummary.payees.title')}
      icon={IconFileList3Line}
      bodyClassName="px-0 pb-0"
    >
      {sections.length === 0 ? (
        <EmptyState
          title={t('reportsSummary.payees.emptyTitle')}
          hint={t('reportsSummary.payees.emptyHint')}
        />
      ) : (
        sections.map((section) => (
          <div key={section.currency}>
            {several ? (
              <p className="border-b px-3 py-1 text-small text-text-muted">
                {t('reportsSummary.payees.currency', {
                  currency: section.currency,
                })}
              </p>
            ) : null}
            {section.payees.map((p) => (
              <Row
                key={p.payee}
                columns={payeeColumns}
                onPress={() => {
                  void navigate({
                    to: '/transactions',
                    search: {
                      payee: p.payee,
                      ...(period === 'cycle' ? {} : { period }),
                    },
                  });
                }}
                cells={[
                  <span key="n" className="font-sans">
                    {p.payee}
                  </span>,
                  <span
                    key="c"
                    className="num block text-right text-text-muted"
                  >
                    {t('reportsSummary.payees.entries', { count: p.count })}
                  </span>,
                  <span key="t" className="block text-right">
                    <Amount amount={p.total} locale={locale} />
                  </span>,
                ]}
              />
            ))}
            {section.unnamed === null ? null : (
              <Row
                columns={payeeColumns}
                cells={[
                  <span key="n" className="font-sans text-text-muted">
                    {t('reportsSummary.payees.unnamed')}
                  </span>,
                  <span
                    key="c"
                    className="num block text-right text-text-muted"
                  >
                    {t('reportsSummary.payees.entries', {
                      count: section.unnamed.count,
                    })}
                  </span>,
                  <span key="t" className="block text-right">
                    <Amount amount={section.unnamed.total} locale={locale} />
                  </span>,
                ]}
              />
            )}
            {section.more === 0 ? null : (
              <p className="border-b px-3 py-1 text-small text-text-muted">
                {t('reportsSummary.payees.more', { count: section.more })}
              </p>
            )}
          </div>
        ))
      )}
    </Tile>
  );
}

function DaysTile({ params }: { params: ReportParams }) {
  const { period, range } = useReportRange();
  const cycles = useQuery(cyclesQuery);
  const cycle = cycleOf(period, cycles.data?.cycles ?? []);
  const days = useQuery(cycleDaysQuery(cycle?.openedOn));
  const calendar = useQuery({
    ...calendarQuery(range?.from ?? FALLBACK_DAY, range?.to ?? FALLBACK_DAY),
    enabled: params.period === 'month' && range?.from !== undefined,
  });
  const source = params.period === 'cycle' ? days : calendar;
  if (source.isError) {
    return (
      <Tile
        title={t('reportsSummary.days.title')}
        icon={IconBarChartBoxLine}
        span="full"
      >
        <ReportFailed
          retry={() => {
            void source.refetch();
          }}
        />
      </Tile>
    );
  }
  const figures =
    params.period === 'cycle'
      ? days.data === undefined
        ? undefined
        : cycleDayFigures(days.data.days)
      : calendar.data === undefined
        ? undefined
        : monthDayFigures(calendar.data);
  if (figures === undefined) return <SkeletonTile span="full" rows={3} />;
  const chart = dayChart(figures, locale);
  return (
    <Tile
      title={t('reportsSummary.days.title')}
      icon={IconBarChartBoxLine}
      subtitle={
        chart.columns.length === 0
          ? undefined
          : t(
              params.period === 'cycle'
                ? 'reportsSummary.days.subtitle'
                : 'reportsSummary.days.subtitleMonth',
              { count: chart.columns.length },
            )
      }
      span="full"
      bodyClassName="flex flex-col"
    >
      {chart.columns.length === 0 ? (
        <EmptyState
          title={t('reportsSummary.days.emptyTitle')}
          hint={t('reportsSummary.days.emptyHint')}
        />
      ) : (
        <>
          <Columns
            height={120}
            data={chart.columns}
            label={
              params.period === 'cycle'
                ? t('reportsSummary.days.summary', { over: chart.overCount })
                : t('reportsSummary.days.summaryPlain')
            }
          />
          {params.period === 'cycle' ? (
            <ChartLegend
              items={[
                {
                  label: t('reportsSummary.days.within'),
                  mark: 'line',
                  color: 'bg-primary',
                },
                {
                  label: t('reportsSummary.days.overLabel'),
                  mark: 'line',
                  color: 'bg-negative',
                },
              ]}
            />
          ) : null}
          {/* A table ignores its own size, so the wrapper hides it. */}
          <div className="sr-only">
            <table>
              <caption>{t('reportsSummary.days.caption')}</caption>
              <thead>
                <tr>
                  <th>{t('reportsSummary.days.day')}</th>
                  <th>{t('reportsSummary.days.spent')}</th>
                  <th>{t('reportsSummary.days.over')}</th>
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((cells) => (
                  <tr key={cells[0]}>
                    {cells.map((cell, i) => (
                      <td key={i}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Tile>
  );
}
