import { money as moneyOf, type Money, type TodayView } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { SkeletonTile } from '@/components/bars';
import { Brackets, bracketClass } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { KeyFigures } from '@/components/stats';
import { useFrameWidth } from '@/components/use-frame-width';
import { Chart, ChartLegend } from '@/charts/chart';
import { niceTicks } from '@/charts/math';
import { formatDay, formatTerminalDate } from '@/features/today/format';
import { formatMoney, formatMoneyShort } from '@/lib/format-money';
import { budgetsQuery } from '@/lib/budgets';
import { cycleDaysQuery, todayQuery } from '@/lib/ledger';
import { IconFundsLine } from '@/generated/icons';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import {
  coverUsedItems,
  cycleTicks,
  cycleView,
  paceFigure,
  type CoverUsedItem,
} from './this-cycle-model.ts';

const locale = 'en';
const money = (amount: Money) => formatMoney(amount, 'symbol', locale);

// "This cycle" (docs/ui.md §6): key figures, spent against the even pace,
// and the formula behind today's daily figure. All amounts are the server's.
export function ThisCycleTile() {
  // On a phone the tile is squashed so the rows after it stay in view.
  const compact = useFrameWidth() < 600;
  const today = useQuery(todayQuery);
  const days = useQuery(cycleDaysQuery(today.data?.cycle.openedOn));
  // Only the formula line's cover note needs it: the tile works without.
  const budgets = useQuery(budgetsQuery);

  if (today.isError || days.isError) {
    return (
      <Tile
        title={t('dashboardTiles.thisCycle.title')}
        span={2}
        rows={2}
        primary
      >
        <TileFailed
          retry={() => {
            void today.refetch();
            void days.refetch();
          }}
        />
      </Tile>
    );
  }
  if (today.data === undefined || days.data === undefined) {
    return <SkeletonTile rows={5} span={2} tileRows={2} />;
  }

  const figures = today.data;
  const { daysLeft, paceSpent } = figures;
  const pace = paceFigure(figures.paceDiff);
  const { budget } = days.data;
  const series = days.data.days;
  const view = cycleView(series);
  const first = series[0];
  const last = series.at(-1);
  const todayLabel = t('dashboardTiles.thisCycle.today');

  const xTicks = cycleTicks(series.length, view.todayIndex).map((tick) => ({
    value: tick.index,
    label: tick.today
      ? todayLabel
      : formatTerminalDate(series[tick.index]?.date ?? figures.today, locale),
  }));
  // Axis positions, rounded; not amounts anyone is told they have.
  const top = Math.max(budget.amountMinor, ...view.spentPoints.map((p) => p.y));
  const yTicks = niceTicks(0, top, 4).map((value) => ({
    value,
    label: formatMoneyShort(moneyOf(value, budget.currency), locale),
  }));

  return (
    <Tile
      title={t('dashboardTiles.thisCycle.title')}
      icon={IconFundsLine}
      subtitle={
        first === undefined || last === undefined
          ? undefined
          : t('dashboardTiles.thisCycle.subtitle', {
              from: formatTerminalDate(first.date, locale),
              to: formatTerminalDate(last.date, locale),
              day: view.day,
              length: view.length,
            })
      }
      actions={
        <Link
          to="/reports/$sub"
          params={{ sub: 'cycles' }}
          className={bracketClass}
        >
          <Brackets>{t('dashboardTiles.thisCycle.history')}</Brackets>
        </Link>
      }
      span={2}
      rows={2}
      primary
      bodyClassName="flex flex-col"
    >
      <KeyFigures
        figures={[
          {
            label: t('dashboardTiles.thisCycle.spent'),
            figure: money(paceSpent),
          },
          {
            label: t('dashboardTiles.thisCycle.evenPace'),
            figure: view.pace === null ? '—' : money(view.pace),
            tone: 'muted',
          },
          {
            label: t(`dashboardTiles.thisCycle.${pace.status}Pace`),
            figure: money(pace.amount),
            tone: pace.status === 'over' ? 'negative' : 'positive',
          },
          {
            label: t('dashboardTiles.thisCycle.daysOver'),
            figure: (
              <>
                {String(view.daysOver)}
                {view.day > 0 ? (
                  <span className="text-[0.7em] text-text-muted">
                    {t('dashboardTiles.thisCycle.daysOverOf', {
                      day: view.day,
                    })}
                  </span>
                ) : null}
              </>
            ),
          },
        ]}
      />
      {view.reference === null ? (
        <EmptyState
          title={t('dashboardTiles.thisCycle.noCycle')}
          hint={t('dashboardTiles.thisCycle.noCycleHint')}
        />
      ) : (
        <>
          <Chart
            className="p-0"
            height={compact ? 130 : 150}
            grow
            label={t('dashboardTiles.thisCycle.chartLabel')}
            series={[
              {
                id: 'spent',
                label: t('dashboardTiles.thisCycle.spent'),
                color: 'series-1',
                points: view.spentPoints,
                area: true,
                ...(view.spent === null ? {} : { endLabel: money(view.spent) }),
              },
            ]}
            yTicks={yTicks}
            xTicks={xTicks}
            reference={{
              ...view.reference,
              ...(last === undefined ? {} : { endLabel: money(last.pace) }),
            }}
            {...(view.todayIndex < 0 ? {} : { today: { x: view.todayIndex } })}
            table={{
              caption: t('dashboardTiles.thisCycle.chartCaption'),
              headers: [
                t('dashboardTiles.thisCycle.colDay'),
                t('dashboardTiles.thisCycle.colSpent'),
                t('dashboardTiles.thisCycle.colPace'),
              ],
              rows: series.flatMap((day) =>
                day.cumulativeSpent === null
                  ? []
                  : [
                      [
                        formatDay(day.date, locale),
                        money(day.cumulativeSpent),
                        money(day.pace),
                      ],
                    ],
              ),
            }}
          />
          <ChartLegend
            items={[
              {
                label: t('dashboardTiles.thisCycle.legendSpent'),
                mark: 'line',
                color: 'bg-series-1',
              },
              {
                label: t('dashboardTiles.thisCycle.legendPace'),
                mark: 'dash',
                color: 'bg-text-muted',
              },
            ]}
          />
        </>
      )}
      <Formula
        figures={figures}
        daysLeft={daysLeft}
        squash
        coverUsed={coverUsedItems(budgets.data?.budgets ?? [])}
      />
    </Tile>
  );
}

/**
 * The daily number's working, every term a server figure: on-budget less
 * bills (and what is owed to people) is free money; less set-aside holds,
 * over the days left, is the daily number.
 */
export function Formula({
  figures,
  daysLeft,
  coverUsed = [],
  squash = false,
  className,
}: {
  figures: TodayView;
  daysLeft: number;
  /** What other sources covered this budget period; see `coverUsedItems`. */
  coverUsed?: readonly CoverUsedItem[];
  /** On a phone, drop the cover notes so the line stays one short row. */
  squash?: boolean;
  className?: string;
}) {
  const f = (key: FormulaKey) => t(`dashboardTiles.thisCycle.formula.${key}`);
  const term = (key: string, label: string, value: Money | null) => (
    <span key={key}>
      {label}
      {value === null ? null : (
        <>
          {' '}
          <b className="font-medium text-text">{money(value)}</b>
        </>
      )}
    </span>
  );
  const terms =
    figures.dailyMode === 'daily-budgets'
      ? [term('base', f('dailyBudgets'), figures.dailyBase)]
      : [
          term('on', f('onBudget'), figures.onBudget),
          term('bills', f('bills'), figures.reservedBills),
          ...(figures.reservedIous.amountMinor === 0
            ? []
            : [term('owed', f('owed'), figures.reservedIous)]),
          term('free', f('free'), figures.available),
          ...(figures.dailyMode === 'free' && figures.held.amountMinor !== 0
            ? [term('held', f('held'), figures.held)]
            : []),
        ];
  return (
    <p
      className={cn(
        'mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 border-t pt-2 text-[0.75rem] text-text-muted compact:mt-1.5 compact:flex-nowrap compact:gap-x-2 compact:pt-1.5 compact:text-[0.6875rem]',
        className,
      )}
    >
      {/* One truncated row on a phone: the working may be cut, the daily
          number after it never is. */}
      <span className="contents compact:block compact:min-w-0 compact:flex-1 compact:truncate compact:[&>span]:mr-2.5">
        {terms}
        <span>
          {f('divide')} <b className="font-medium text-text">{daysLeft}</b>{' '}
          {t('dashboardTiles.thisCycle.formula.days', { count: daysLeft })}
        </span>
      </span>
      <span className="compact:shrink-0">
        {f('equals')}{' '}
        <b className="font-semibold text-positive">
          {money(figures.liveDaily)}
        </b>
        {f('perDay')}
      </span>
      {coverUsed.slice(0, COVER_NOTES).map((item) => (
        <span
          key={`${item.budget}\u0000${item.source}`}
          className={cn(squash && 'compact:hidden')}
        >
          {t('dashboardTiles.thisCycle.formula.coverUsed')}{' '}
          <b className="font-medium text-text">{money(item.amount)}</b>{' '}
          {t('dashboardTiles.thisCycle.formula.coverFrom', {
            budget: item.budget,
            source: item.source,
          })}
        </span>
      ))}
      {coverUsed.length > COVER_NOTES ? (
        <span className={cn(squash && 'compact:hidden')}>
          {t('dashboardTiles.thisCycle.formula.coverMore', {
            count: coverUsed.length - COVER_NOTES,
          })}
        </span>
      ) : null}
    </p>
  );
}

/** Cover notes shown in the formula line; the rest fold into "+N more". */
const COVER_NOTES = 2;

type FormulaKey =
  | 'onBudget'
  | 'bills'
  | 'owed'
  | 'free'
  | 'held'
  | 'dailyBudgets'
  | 'divide'
  | 'equals'
  | 'perDay';
