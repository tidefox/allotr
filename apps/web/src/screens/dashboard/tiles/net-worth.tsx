import { daysBetween, money } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Chart } from '@/charts/chart';
import { niceTicks } from '@/charts/math';
import { formatDay, formatTerminalDate } from '@/features/today/format';
import { netWorthChart, worthDays } from '@/features/net-worth/model';
import { IconLineChartLine } from '@/generated/icons';
import { formatMoney, formatMoneyShort } from '@/lib/format-money';
import { todayQuery } from '@/lib/ledger';
import { netWorthQuery } from '@/lib/plan';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';

const locale = 'en';
const FALLBACK_DAYS = 30;

// Net worth (docs/ui.md §6) over the open cycle, so the server's `change`
// is this cycle's; the API's shortest window is a week.
export function NetWorthTile() {
  const today = useQuery(todayQuery);
  const days =
    today.data === undefined
      ? FALLBACK_DAYS
      : worthDays(today.data.cycle.openedOn, today.data.today);
  // A cycle younger than the shortest window is shown as that window.
  const wholeCycle =
    today.data !== undefined &&
    daysBetween(today.data.cycle.openedOn, today.data.today) + 1 === days;
  const worth = useQuery({
    ...netWorthQuery(days),
    enabled: today.data !== undefined,
  });
  const data = worth.data;
  const title = t('dashboardTiles.netWorth.title');

  if (worth.isError || today.isError) {
    return (
      <Tile title={title} icon={IconLineChartLine} span={2}>
        <TileFailed
          retry={() => {
            void today.refetch();
            void worth.refetch();
          }}
        />
      </Tile>
    );
  }
  if (data === undefined) return <SkeletonTile span={2} />;

  const chart = netWorthChart(data.series, locale);
  const last = data.series.at(-1);
  const ys = chart.points.map((p) => p.y);
  const currency = data.amount.currency;
  // Axis positions, rounded; not amounts anyone is told they have.
  const yTicks =
    ys.length === 0
      ? []
      : niceTicks(Math.min(...ys), Math.max(...ys), 4).map((value) => ({
          value,
          label: formatMoneyShort(money(value, currency), locale),
        }));
  const xTicks = chart.xTicks.map((tick) => {
    const point = data.series[tick.value];
    return {
      value: tick.value,
      label:
        point === undefined
          ? tick.label
          : formatTerminalDate(point.date, locale),
    };
  });

  return (
    <Tile
      title={title}
      icon={IconLineChartLine}
      subtitle={
        wholeCycle
          ? t('dashboardTiles.netWorth.subtitle')
          : t('dashboardTiles.netWorth.subtitleDays', { days })
      }
      span={2}
      bodyClassName="flex flex-col"
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-big leading-[1.15] font-semibold tracking-[-0.01em]">
          <Amount amount={data.amount} locale={locale} />
        </span>
        <Amount amount={data.change} kind="change" locale={locale} />
      </div>
      {last === undefined ? (
        <EmptyState title={title} hint={t('dashboardTiles.netWorth.empty')} />
      ) : (
        <Chart
          className="p-0"
          height={110}
          grow
          label={t('dashboardTiles.netWorth.summary', {
            days,
            end: formatMoney(data.amount, 'symbol', locale),
            change: formatMoney(data.change, 'symbol', locale),
          })}
          series={[
            {
              id: 'net-worth',
              label: t('dashboardTiles.netWorth.total'),
              color: 'series-1',
              points: chart.points,
              area: true,
            },
          ]}
          yTicks={yTicks}
          xTicks={xTicks}
          table={{
            caption: t('dashboardTiles.netWorth.caption'),
            headers: [
              t('dashboardTiles.netWorth.day'),
              t('dashboardTiles.netWorth.total'),
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
