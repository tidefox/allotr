import type { PoolKind } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import { Amount } from '@/components/amount';
import { LeftBar, Skeleton, seriesBg, seriesText } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { formatTerminalDay } from '@/features/today/format';
import {
  IconCalendarCheckLine,
  IconSafe2Line,
  IconSunLine,
  IconWallet3Line,
  type IconProps,
} from '@/generated/icons';
import { poolsQuery } from '@/lib/budgets';
import { formatMoney } from '@/lib/format-money';
import { todayQuery } from '@/lib/ledger';
import { glyph } from '@/lib/pool-style';
import { useLedgerReady } from '@/lib/session';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { poolRows } from '@/screens/dashboard/tiles/pools-model';
import { barFraction, cycleDays } from './summary-math.ts';

// The summary bar (docs/ui.md §3). Priority order, left to right: left
// today, the on-budget total, the pools, then the payday where there is
// room (≥ 1000). Every figure is one the server sent; the bars are display
// ratios of same-currency server figures (ADR 0030), and the payday block
// counts days from dates. Items sit on 1 px seams (the gaps show the
// `outline-variant` behind them).
//
// Phone: left today and the on-budget total share the first row, the pools
// scroll sideways on the second. From 600 px one row: the pools form a
// grid two rows high when there are more than two.

const locale = 'en';

const item =
  'press flex min-w-0 flex-[1_1_40%] flex-col justify-center overflow-hidden bg-chrome px-2.5 py-1.5 text-left medium:flex-[1_1_0%] medium:px-3.5 medium:py-2 wide:px-[1.125rem] wide:py-2.5';

function Label({
  icon: Icon,
  children,
}: {
  icon: ComponentType<IconProps>;
  children: ReactNode;
}) {
  return (
    <span className="block truncate text-tiny leading-[1.45] text-text-muted">
      <Icon className="mr-1 inline size-[1.15em] align-[-0.22em]" />
      {children}
    </span>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return (
    <span className="block truncate text-tiny leading-[1.45] text-text-muted">
      {children}
    </span>
  );
}

const poolIcon: Record<PoolKind, ComponentType<IconProps>> = {
  spending: IconWallet3Line,
  savings: IconSafe2Line,
};

function Pools() {
  const ready = useLedgerReady();
  const pools = useQuery({ ...poolsQuery, enabled: ready });
  const list = pools.data?.pools ?? [];
  const rows = poolRows(list);
  if (rows.length === 0) return null;
  const kinds = new Map(list.map((pool) => [pool.id, pool.kind]));
  const count = rows.length;
  const tall = count > 2 ? 2 : 1;
  const columns = Math.ceil(count / tall);
  const style = {
    '--pool-rows': tall,
    '--pool-grow': columns * 0.8,
    '--pool-shown': Math.min(count, 4),
  } as CSSProperties;
  return (
    <ul
      aria-label={t('shell.summary.pools')}
      style={style}
      className={cn(
        'scroll grid min-w-0 flex-[1_1_100%] grid-flow-col gap-px bg-outline-variant',
        'auto-cols-[minmax(calc(100%/var(--pool-shown)),1fr)]',
        'medium:flex-[var(--pool-grow)_1_0%] medium:auto-cols-[minmax(0,1fr)] medium:grid-rows-[repeat(var(--pool-rows),minmax(0,1fr))] medium:overflow-hidden',
      )}
    >
      {rows.map((row) => {
        const Icon = glyph(row.icon, poolIcon[kinds.get(row.id) ?? 'savings']);
        const amount = formatMoney(row.balance, 'symbol', locale);
        return (
          <li key={row.id} className="flex min-w-0">
            <Link
              to="/budget/$sub"
              params={{ sub: 'pools' }}
              aria-label={t(
                row.checked ? 'shell.summary.poolCounts' : 'shell.summary.pool',
                { name: row.name, amount },
              )}
              className="press flex min-w-0 flex-1 flex-col justify-center bg-chrome px-2 py-1 text-left wide:px-3 wide:py-1.5"
            >
              <span className="flex min-w-0 items-center gap-1 text-[0.625rem] leading-[1.45] text-text-muted wide:text-[0.6875rem]">
                <Icon
                  className={cn('size-3 shrink-0', seriesText[row.color])}
                />
                <span className="truncate">{row.name}</span>
                {row.checked ? (
                  <span
                    aria-hidden="true"
                    className="ml-auto shrink-0 text-[0.5625rem] text-positive"
                  >
                    ●
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  'truncate text-[0.75rem] leading-[1.45] wide:text-[0.9375rem]',
                  row.checked ? 'font-semibold' : 'font-medium text-text-muted',
                )}
              >
                <Amount amount={row.balance} locale={locale} />
              </span>
              {row.cycle === null ? null : (
                <LeftBar
                  fraction={row.cycle.fraction}
                  height={2}
                  label={t('shell.summary.poolBar')}
                  className="mt-[3px]"
                  fillClassName={seriesBg[row.color]}
                />
              )}
            </Link>
          </li>
        );
      })}
      {tall === 2 && count % 2 === 1 ? (
        <li aria-hidden="true" className="hidden bg-chrome medium:block" />
      ) : null}
    </ul>
  );
}

export function SummaryBar() {
  const ready = useLedgerReady();
  const today = useQuery({ ...todayQuery, enabled: ready });
  const data = today.data;

  return (
    <section
      aria-label={t('shell.slots.summary')}
      data-slot="summary"
      className="flex min-w-0 flex-wrap gap-px border-b bg-outline-variant medium:col-start-2 medium:row-start-1 medium:h-topbar medium:flex-nowrap"
    >
      {today.isError ? (
        <div
          role="alert"
          className="flex flex-1 items-center gap-2 bg-chrome px-3 text-small"
        >
          <span className="text-negative">{t('shell.summary.loadFailed')}</span>
          <BracketButton onPress={() => void today.refetch()}>
            {t('shell.summary.retry')}
          </BracketButton>
        </div>
      ) : data === undefined ? (
        <div
          aria-busy="true"
          className="flex min-h-bar w-full flex-col justify-center gap-1 bg-chrome px-3 py-2"
        >
          <Skeleton width="40%" height="1.25rem" />
          <Skeleton width="25%" height="0.75rem" />
        </div>
      ) : (
        <>
          <Link
            to="/"
            className={cn(
              item,
              'border-l-[3px] border-l-positive bg-canvas medium:flex-[1.3_1_0%]',
            )}
          >
            <Label icon={IconSunLine}>{t('shell.summary.leftToday')}</Label>
            <span
              className={cn(
                'truncate text-hero leading-[1.2] font-semibold tracking-[-0.01em] wide:leading-[1.1]',
                data.leftToday.amountMinor < 0
                  ? 'text-negative'
                  : 'text-positive',
              )}
            >
              <Amount amount={data.leftToday} />
              <small className="ml-[3px] text-[0.6em] font-normal tracking-normal text-text-muted">
                {'/ '}
                {formatMoney(data.todayAllowance, 'symbol', locale)}
              </small>
            </span>
            <Sub>
              {t('shell.summary.spent', {
                amount: formatMoney(data.spentToday, 'symbol', locale),
              })}
              {' · '}
              {data.overdue
                ? t('shell.summary.overdue')
                : t('shell.summary.daysToPayday', { count: data.daysLeft })}
            </Sub>
            <LeftBar
              fraction={barFraction(
                data.leftToday.amountMinor,
                data.todayAllowance.amountMinor,
              )}
              label={t('shell.summary.leftTodayBar')}
              className="mt-1"
            />
          </Link>
          <Link
            to="/accounts/$sub"
            params={{ sub: 'on-budget' }}
            className={item}
          >
            <Label icon={IconWallet3Line}>{t('shell.summary.onBudget')}</Label>
            <span className="truncate text-pulse leading-[1.2] font-semibold">
              <Amount amount={data.onBudget} />
            </span>
            <Sub>
              {t('shell.summary.onBudgetSub', {
                start: formatMoney(data.allocation.start, 'symbol', locale),
                reserved: formatMoney(data.reservedBills, 'symbol', locale),
                free: formatMoney(data.available, 'symbol', locale),
              })}
            </Sub>
            <LeftBar
              fraction={barFraction(
                data.onBudget.amountMinor,
                data.allocation.start.amountMinor,
              )}
              label={t('shell.summary.onBudgetBar')}
              className="mt-1"
              fillClassName="bg-text"
            />
          </Link>
          <Pools />
          <Payday
            openedOn={data.cycle.openedOn}
            today={data.today}
            payday={data.cycleEnd}
            daysLeft={data.daysLeft}
          />
        </>
      )}
    </section>
  );
}

function Payday({
  openedOn,
  today,
  payday,
  daysLeft,
}: {
  openedOn: Parameters<typeof cycleDays>[0];
  today: Parameters<typeof cycleDays>[1];
  payday: Parameters<typeof cycleDays>[2];
  daysLeft: number;
}) {
  const { day, length } = cycleDays(openedOn, today, payday);
  return (
    <Link
      to="/reports/$sub"
      params={{ sub: 'calendar' }}
      className={cn(item, 'hidden wide:flex wide:flex-[0.8_1_0%]')}
    >
      <Label icon={IconCalendarCheckLine}>{t('shell.summary.payday')}</Label>
      <span className="truncate text-pulse leading-[1.2] font-semibold">
        {t('shell.summary.paydayDays', { count: daysLeft })}
      </span>
      <Sub>
        {t('shell.summary.paydaySub', {
          date: formatTerminalDay(payday, locale),
          day,
          length,
        })}
      </Sub>
      <LeftBar
        fraction={barFraction(daysLeft, length)}
        label={t('shell.summary.paydayBar')}
        className="mt-1"
        fillClassName="bg-text"
      />
    </Link>
  );
}
