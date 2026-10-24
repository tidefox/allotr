import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type LocalDate } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, Tag } from '@/components/buttons';
import { Stack, Tile } from '@/components/layout';
import { MenuButton, MenuItem } from '@/components/menu';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { EmptyState } from '@/components/states';
import { Timeline } from '@/charts/timeline';
import {
  IconAddLine,
  IconBillLine,
  IconCalendar2Line,
  IconCalendarCheckLine,
  IconCalendarLine,
  IconMore2Line,
} from '@/generated/icons';
import { formatTerminalDate } from '@/features/today/format';
import { formatMoney, formatMoneyShort } from '@/lib/format-money';
import { accountsQuery, todayQuery } from '@/lib/ledger';
import { openNewForm } from '@/shell/command/store.ts';
import { billsQuery } from '@/lib/settings';
import { t } from '@/messages/t';
import {
  billsView,
  cycleDayDate,
  dueStatus,
  type DueItem,
} from './bills-model.ts';
import { SumLine } from './sum-line.tsx';

const locale = 'en';
const money = (amount: Parameters<typeof formatMoney>[0]) =>
  formatMoney(amount, 'symbol', locale);

// Date, icon, name, account, amount, tag, action. The status tag (`3d`,
// `25d late`) is the most important fact on a due bill, so a phone drops
// the account first and keeps the tag.
const billColumns: readonly RowColumn[] = [
  { width: '7ch' },
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: '11ch', from: 'medium' },
  { width: '10ch' },
  { width: 'auto' },
  { width: 'auto' },
];

/** `3d`, `today`, `2d late`: day counting only. */
function dueTag(dueOn: LocalDate, today: LocalDate) {
  const due = dueStatus(dueOn, today);
  if (due.state === 'late')
    return (
      <Tag tone="negative">{t('budgetBills.tag.late', { days: due.days })}</Tag>
    );
  if (due.state === 'today')
    return <Tag tone="warning">{t('budgetBills.tag.today')}</Tag>;
  return (
    <Tag tone={due.days <= 3 ? 'warning' : 'muted'}>
      {t('budgetBills.tag.in', { days: due.days })}
    </Tag>
  );
}

/** The next bill's timing for the summary line: it reads late when it is. */
function nextWhen(dueOn: LocalDate, today: LocalDate): string {
  const due = dueStatus(dueOn, today);
  if (due.state === 'late')
    return t('budgetBills.tag.late', { days: due.days });
  if (due.state === 'today') return t('budgetBills.tag.today');
  return t('budgetBills.tag.in', { days: due.days });
}

function BillRow({
  item,
  today,
  account,
}: {
  item: DueItem;
  today: LocalDate;
  account: string;
}) {
  const navigate = useNavigate();
  const name = item.name === '' ? t('budgetBills.timeline.unknown') : item.name;
  const paid = item.paidOn !== null;
  const entry = item.paymentEntryId;
  return (
    <Row
      columns={billColumns}
      cells={[
        <span key="d" className="text-text-muted">
          {formatTerminalDate(item.dueOn, locale)}
        </span>,
        <IconBillLine
          key="i"
          aria-hidden="true"
          className="size-4 text-warning"
        />,
        <span key="n" className="font-sans">
          {name}
        </span>,
        <span key="a" className="font-sans text-text-muted">
          {account}
        </span>,
        <span key="m" className="block text-right">
          <Amount amount={item.amount} locale={locale} />
        </span>,
        <span key="t" className="flex justify-end">
          {paid ? (
            <Tag tone="positive">{t('budgetBills.tag.paid')}</Tag>
          ) : (
            dueTag(item.dueOn, today)
          )}
        </span>,
        paid && entry !== null ? (
          <span key="x" className="flex justify-end">
            <MenuButton
              variant="bracket"
              icon={IconMore2Line}
              label={t('budgetBills.paid.actionsOf', { name })}
              title={name}
            >
              <MenuItem
                id="show"
                label={t('budgetBills.paid.show')}
                onAction={() => {
                  void navigate({
                    to: '/transactions',
                    search: { entry },
                  });
                }}
              />
            </MenuButton>
          </span>
        ) : null,
      ]}
    />
  );
}

// Budget · bills (docs/ui.md §6): the cycle's timeline with set aside, paid
// and next; the unpaid due dates with a "set aside of" bar; and what was
// paid this cycle. Figures are the server's (`reservedBills`, `allocation.paidBills`).
export function BillsTab() {
  const today = useQuery(todayQuery);
  const bills = useQuery(billsQuery);
  const accounts = useQuery(accountsQuery);

  if (today.isError || bills.isError) {
    return (
      <Tile title={t('nav.budget')}>
        <EmptyState
          title={t('budgetBills.failed')}
          hint=""
          action={
            <BracketButton
              onPress={() => {
                void today.refetch();
                void bills.refetch();
              }}
            >
              {t('budgetBills.retry')}
            </BracketButton>
          }
        />
      </Tile>
    );
  }
  if (today.data === undefined || bills.data === undefined) {
    return (
      <Stack className="min-h-full">
        <SkeletonTile rows={4} />
        <SkeletonTile rows={3} />
        <SkeletonTile rows={3} />
      </Stack>
    );
  }

  const view = billsView(
    today.data,
    bills.data.bills,
    {
      payday: t('budgetBills.timeline.payday'),
      unknown: t('budgetBills.timeline.unknown'),
    },
    (amount) => formatMoneyShort(amount, locale),
  );
  const opened = today.data.cycle.openedOn;
  const day = today.data.today;
  const { next } = view;
  const nextName =
    next === null
      ? ''
      : next.name === ''
        ? t('budgetBills.timeline.unknown')
        : next.name;
  const accountNames = new Map(
    (accounts.data?.accounts ?? []).map((a) => [a.id, a.name]),
  );
  const accountOf = (item: DueItem) =>
    item.accountId === null ? '' : (accountNames.get(item.accountId) ?? '');

  return (
    <Stack className="min-h-full">
      <Tile
        title={t('budgetBills.timeline.title')}
        icon={IconCalendar2Line}
        subtitle={t('budgetBills.timeline.subtitle', {
          from: formatTerminalDate(opened, locale),
          to: formatTerminalDate(today.data.cycleEnd, locale),
        })}
        actions={
          <BracketButton
            icon={IconAddLine}
            aria-label={t('billForm.addLabel')}
            onPress={() => {
              openNewForm('bill');
            }}
          >
            {t('billForm.add')}
          </BracketButton>
        }
      >
        <Timeline
          days={view.timeline.days}
          today={view.timeline.today}
          events={view.timeline.events}
          dayLabel={(d) => formatTerminalDate(cycleDayDate(opened, d), locale)}
          label={t('budgetBills.timeline.label')}
        />
        <SumLine
          parts={[
            {
              key: 'aside',
              label: t('budgetBills.figures.setAside'),
              value: money(today.data.reservedBills),
            },
            {
              key: 'paid',
              label: t('budgetBills.figures.paid'),
              value: money(today.data.allocation.paidBills),
            },
            {
              key: 'next',
              label: t('budgetBills.figures.next'),
              value:
                next === null
                  ? t('budgetBills.figures.none')
                  : t('budgetBills.figures.nextValue', {
                      name: nextName,
                      when: nextWhen(next.dueOn, day),
                    }),
            },
          ]}
          className="pt-2"
        />
      </Tile>
      <Tile
        title={t('budgetBills.upcoming.title')}
        icon={IconBillLine}
        subtitle={t('budgetBills.upcoming.subtitle', {
          count: view.upcoming.length,
        })}
      >
        {view.upcoming.length === 0 ? (
          <EmptyState
            title={t('budgetBills.upcoming.empty')}
            hint={t('budgetBills.upcoming.emptyHint')}
          />
        ) : (
          <>
            <p className="num pb-1.5 text-tiny text-text-muted">
              {t('budgetBills.upcoming.stillSetAside', {
                amount: money(today.data.reservedBills),
              })}
            </p>
            <ul className="-mx-3">
              {view.upcoming.map((item) => (
                <li key={item.id}>
                  <BillRow item={item} today={day} account={accountOf(item)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Tile>
      <Tile
        title={t('budgetBills.paid.title')}
        icon={IconCalendarCheckLine}
        subtitle={money(today.data.allocation.paidBills)}
      >
        {view.paid.length === 0 ? (
          <EmptyState
            title={t('budgetBills.paid.empty')}
            hint={t('budgetBills.paid.emptyHint')}
          />
        ) : (
          <ul className="-mx-3">
            {view.paid.map((item) => (
              <li key={item.id}>
                <BillRow item={item} today={day} account={accountOf(item)} />
              </li>
            ))}
          </ul>
        )}
      </Tile>
      {view.later.length === 0 ? null : (
        <Tile
          title={t('budgetBills.later.title')}
          icon={IconCalendarLine}
          subtitle={t('budgetBills.later.subtitle')}
        >
          <ul className="-mx-3">
            {view.later.map((bill) => (
              <li key={bill.id}>
                <Row
                  columns={billColumns}
                  cells={[
                    <span key="d" className="text-text-muted">
                      {t('budgetBills.later.day', { day: bill.dueDay })}
                    </span>,
                    <IconBillLine
                      key="i"
                      aria-hidden="true"
                      className="size-4 text-text-muted"
                    />,
                    <span key="n" className="font-sans">
                      {bill.name}
                    </span>,
                    <span key="a" className="font-sans text-text-muted">
                      {accountNames.get(bill.accountId) ?? ''}
                    </span>,
                    <span key="m" className="block text-right">
                      <Amount amount={bill.amount} locale={locale} />
                    </span>,
                    null,
                    null,
                  ]}
                />
              </li>
            ))}
          </ul>
        </Tile>
      )}
    </Stack>
  );
}
