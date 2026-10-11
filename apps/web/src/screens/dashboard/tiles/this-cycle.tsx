import { money as moneyOf, type Money, type TodayView } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { SkeletonTile } from '@/components/bars';
import { Brackets, bracketClass } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { KeyFigures } from '@/components/stats';
import { Chart, ChartLegend } from '@/charts/chart';
import { niceTicks } from '@/charts/math';
import { formatDay, formatTerminalDate } from '@/features/today/format';
import { formatMoney, formatMoneyShort } from '@/lib/format-money';
import { cycleDaysQuery, todayQuery } from '@/lib/ledger';
import { IconFundsLine } from '@/generated/icons';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import { cycleTicks, cycleView } from './this-cycle-model.ts';

const locale = 'en';
const money = (amount: Money) => formatMoney(amount, 'symbol', locale);

// "This cycle" (docs/ui.md §6): key figures, spent against the even pace,
// and the formula behind today's daily figure. All amounts are the server's.
export function ThisCycleTile() {
  const today = useQuery(todayQuery);
  const days = useQuery(cycleDaysQuery(today.data?.cycle.openedOn));

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
            label: t('dashboardTiles.thisCycle.pace'),
            figure: t(
              view.status === 'ahead'
                ? 'dashboardTiles.thisCycle.ahead'
                : 'dashboardTiles.thisCycle.under',
            ),
            tone: view.status === 'ahead' ? 'negative' : 'positive',
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
            height={150}
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
      <Formula figures={figures} daysLeft={daysLeft} />
    </Tile>
  );
}

/**
 * The daily number's working, every term a server figure: on-budget less
 * bills (and what is owed to people) is free money; less set-aside holds,
 * over the days left, is the daily number.
 */
function Formula({
  figures,
  daysLeft,
}: {
  figures: TodayView;
  daysLeft: number;
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
    <p className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 border-t pt-2 text-[0.75rem] text-text-muted compact:block compact:truncate compact:text-[0.6875rem] compact:[&>span]:mr-2.5">
      {terms}
      <span>
        {f('divide')} <b className="font-medium text-text">{daysLeft}</b>{' '}
        {t('dashboardTiles.thisCycle.formula.days', { count: daysLeft })}
      </span>
      <span>
        {f('equals')}{' '}
        <b className="font-semibold text-positive">
          {money(figures.liveDaily)}
        </b>
        {f('perDay')}
      </span>
    </p>
  );
}

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
