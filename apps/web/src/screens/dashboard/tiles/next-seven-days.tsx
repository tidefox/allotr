import { addDays, localDate } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { Brackets, bracketClass } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { formatTerminalWeekday } from '@/features/today/format';
import {
  IconBillLine,
  IconCalendar2Line,
  IconHandCoinLine,
  IconMoneyDollarCircleLine,
} from '@/generated/icons';
import { calendarQuery, todayQuery } from '@/lib/ledger';
import { billsQuery } from '@/lib/settings';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import {
  upcomingDays,
  upcomingItems,
  type UpcomingKind,
} from './next-seven-days.ts';

const locale = 'en';
const NONE = localDate('2000-01-01');

const columns = [
  { width: '7ch' },
  { width: '1.125rem' },
  { width: 'minmax(0,1fr)' },
  { width: 'auto' },
] as const;

const kindIcon: Record<UpcomingKind, ReactNode> = {
  bill: <IconBillLine className="size-4 text-warning" />,
  iou: <IconHandCoinLine className="size-4 text-series-2" />,
  payday: <IconMoneyDollarCircleLine className="size-4 text-success" />,
};

export function NextSevenDaysTile() {
  const today = useQuery(todayQuery);
  const day = today.data?.today;
  const calendar = useQuery({
    ...calendarQuery(day ?? NONE, addDays(day ?? NONE, 6)),
    enabled: day !== undefined,
  });
  const bills = useQuery(billsQuery);
  const title = t('dashboardTiles.nextDays.title');

  if (today.isError || calendar.isError) {
    return (
      <Tile title={title}>
        <TileFailed
          retry={() => {
            void today.refetch();
            void calendar.refetch();
          }}
        />
      </Tile>
    );
  }
  if (day === undefined || calendar.data === undefined) {
    return <SkeletonTile rows={4} />;
  }
  const items = upcomingItems(calendar.data, bills.data?.bills ?? [], day, {
    payday: t('dashboardTiles.nextDays.payday'),
    bill: t('dashboardTiles.nextDays.bill'),
  });
  const days = upcomingDays(items, day);
  return (
    <Tile
      title={title}
      icon={IconCalendar2Line}
      actions={
        <Link
          to="/reports/$sub"
          params={{ sub: 'calendar' }}
          className={bracketClass}
        >
          <Brackets>{t('dashboardTiles.nextDays.calendar')}</Brackets>
        </Link>
      }
      bodyClassName="px-0 pb-0"
    >
      {days.flatMap(({ date, items: due }) => {
        const label = (
          <span key="d" className="text-text-muted">
            {formatTerminalWeekday(date, locale)}
          </span>
        );
        if (due.length === 0) {
          return [
            <Row
              key={date}
              columns={columns}
              cells={[
                label,
                null,
                <span key="n" aria-hidden="true" className="text-text-muted">
                  ·
                </span>,
                null,
              ]}
            />,
          ];
        }
        return due.map((item) => (
          <Row
            key={item.key}
            columns={columns}
            cells={[
              label,
              <span key="i" aria-hidden="true" className="flex">
                {kindIcon[item.kind]}
              </span>,
              <span key="n" className="font-sans">
                {item.label}
              </span>,
              item.amount === null ? null : (
                <Amount
                  key="a"
                  amount={item.amount}
                  kind={item.amount.amountMinor < 0 ? 'expense' : 'income'}
                />
              ),
            ]}
          />
        ));
      })}
    </Tile>
  );
}
