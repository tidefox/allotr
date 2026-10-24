import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ToggleButton } from 'react-aria-components';
import { localDate, type LocalDate } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Split, Stack, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon } from '@/components/states';
import { CalendarGrid } from '@/charts/calendar-grid';
import { monthRange, shiftMonth } from '@/features/calendar/model';
import { formatDay, formatLongDay } from '@/features/today/format';
import {
  IconArrowLeftSLine,
  IconArrowRightSLine,
  IconBillLine,
  IconCalendar2Line,
  IconCalendarCheckLine,
  IconHandCoinLine,
  IconMoneyDollarCircleLine,
  IconTableLine,
} from '@/generated/icons';
import { seriesNumber } from '@/lib/category-style';
import {
  accountsQuery,
  calendarQuery,
  categoriesQuery,
  entriesOnQuery,
} from '@/lib/ledger';
import { billsQuery } from '@/lib/settings';
import { t } from '@/messages/t';
import {
  dashboardEntries,
  entryAmountKind,
} from '../dashboard/tiles/todays-entries-model.ts';
import {
  dayItems,
  defaultPick,
  findDay,
  formatMonth,
  inMonth,
  monthOf,
  weekdayNames,
  type DayItem,
} from './calendar-model.ts';
import { useReportRange } from './use-report-range.ts';

const locale = 'en';
const NONE = localDate('2000-01-01');

// The layer switch (`tog`): two bordered segments, each its own toggle.
const layerClass =
  'press inline-flex min-h-hit items-center px-2.5 py-0.5 text-title text-text-muted not-first:border-l not-first:border-outline selected:bg-primary selected:text-on-primary';

const columns: readonly RowColumn[] = [
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
];

function itemKind(item: DayItem): string {
  switch (item.type) {
    case 'payday':
      return t('reportsCalendar.day.payday');
    case 'bill':
      return item.paid
        ? t('reportsCalendar.day.billPaid')
        : t('reportsCalendar.day.bill');
    case 'iou':
      return item.direction === 'owed-to-me'
        ? t('reportsCalendar.day.iouOwedToMe')
        : t('reportsCalendar.day.iouOwedByMe');
  }
}

function itemName(item: DayItem): string {
  switch (item.type) {
    case 'payday':
      return t('reportsCalendar.day.paydayName');
    case 'bill':
      return item.name === '' ? t('reportsCalendar.day.bill') : item.name;
    case 'iou':
      return item.person;
  }
}

// Reports · calendar (docs/ui.md §6): the layer switch, the month grid and
// the picked day's entries, bills and dues. Spending, heat and marks are the
// server's (`/v1/reports/calendar`). It opens on today's month and steps
// from the tile; the period menu does not apply here.
export function CalendarTab() {
  const { today } = useReportRange();
  const navigate = useNavigate();
  const [showHeat, setShowHeat] = useState(true);
  const [showDue, setShowDue] = useState(true);
  const [asTable, setAsTable] = useState(false);
  // The month and day the user stepped to.
  const [stepped, setStepped] = useState<{
    month: string;
    picked: LocalDate | null;
  } | null>(null);

  const month =
    stepped?.month ?? (today === undefined ? undefined : monthOf(today));
  const span = month === undefined ? undefined : monthRange(month);

  const calendar = useQuery({
    ...calendarQuery(span?.from ?? NONE, span?.to ?? NONE),
    enabled: span !== undefined,
  });
  const bills = useQuery(billsQuery);
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);

  const pickedRaw =
    stepped !== null && stepped.month === month ? stepped.picked : null;
  const picked: LocalDate | undefined =
    month === undefined || today === undefined
      ? undefined
      : pickedRaw !== null && inMonth(pickedRaw, month)
        ? pickedRaw
        : defaultPick(month, today);
  const entries = useQuery(entriesOnQuery(picked));

  const step = (delta: -1 | 1) => {
    if (span === undefined) return;
    setStepped({ month: shiftMonth(span, delta).month, picked: null });
  };
  const pick = (date: LocalDate) => {
    if (month === undefined) return;
    setStepped({ month, picked: date });
  };

  if (calendar.isError) {
    return (
      <Stack className="min-h-full">
        <LayerBar
          showHeat={showHeat}
          setShowHeat={setShowHeat}
          showDue={showDue}
          setShowDue={setShowDue}
        />
        <Tile title={t('reportsCalendar.title')} icon={IconCalendar2Line}>
          <div role="alert" className="flex items-center gap-2 py-2 text-small">
            <span className="text-negative">{t('reportsCalendar.failed')}</span>
            <BracketButton
              onPress={() => {
                void calendar.refetch();
              }}
            >
              {t('reportsCalendar.retry')}
            </BracketButton>
          </div>
        </Tile>
      </Stack>
    );
  }
  if (
    span === undefined ||
    month === undefined ||
    today === undefined ||
    picked === undefined ||
    calendar.data === undefined
  ) {
    return (
      <Stack className="min-h-full">
        <LayerBar
          showHeat={showHeat}
          setShowHeat={setShowHeat}
          showDue={showDue}
          setShowDue={setShowDue}
        />
        <SkeletonTile rows={6} />
      </Stack>
    );
  }

  const billNames = new Map(
    (bills.data?.bills ?? []).map((b) => [b.id, b.name]),
  );
  const day = findDay(calendar.data.days, picked);
  const items = dayItems(day, billNames);
  const rows =
    entries.data === undefined ||
    accounts.data === undefined ||
    categories.data === undefined
      ? []
      : dashboardEntries(
          entries.data.transactions,
          accounts.data.accounts,
          categories.data.categories,
        );
  const listLoading =
    entries.data === undefined &&
    !entries.isError &&
    accounts.data === undefined;

  return (
    <Stack className="min-h-full">
      <LayerBar
        showHeat={showHeat}
        setShowHeat={setShowHeat}
        showDue={showDue}
        setShowDue={setShowDue}
      />
      <Split
        even
        className="border-t-0 border-l-0"
        list={
          <Tile
            title={formatMonth(month, locale).toLocaleLowerCase(locale)}
            icon={IconCalendar2Line}
            className="h-full"
            actions={
              <>
                <BracketButton
                  icon={IconArrowLeftSLine}
                  aria-label={t('reportsCalendar.month.previous')}
                  onPress={() => {
                    step(-1);
                  }}
                />
                <BracketButton
                  icon={IconArrowRightSLine}
                  aria-label={t('reportsCalendar.month.next')}
                  onPress={() => {
                    step(1);
                  }}
                />
                <BracketButton
                  icon={IconTableLine}
                  aria-pressed={asTable}
                  onPress={() => {
                    setAsTable((on) => !on);
                  }}
                >
                  {asTable
                    ? t('reportsCalendar.grid')
                    : t('reportsCalendar.table')}
                </BracketButton>
              </>
            }
          >
            <CalendarGrid
              month={span}
              days={calendar.data.days}
              today={today}
              picked={picked}
              onPick={pick}
              showHeat={showHeat}
              showDue={showDue}
              view={asTable ? 'table' : 'grid'}
              weekdays={weekdayNames(locale).map((d) =>
                d.toLocaleLowerCase(locale),
              )}
              headers={{
                date: t('reportsCalendar.headers.date'),
                spent: t('reportsCalendar.headers.spent'),
                due: t('reportsCalendar.headers.due'),
              }}
              dateLabel={(date) => formatLongDay(date, locale)}
              markNames={{
                b: t('reportsCalendar.marks.b'),
                i: t('reportsCalendar.marks.i'),
                $: t('reportsCalendar.marks.$'),
                o: t('reportsCalendar.marks.o'),
              }}
              locale={locale}
            />
          </Tile>
        }
        detail={
          listLoading ? (
            <SkeletonTile rows={3} />
          ) : (
            <Tile
              title={formatDay(picked, locale).toLocaleLowerCase(locale)}
              icon={IconCalendarCheckLine}
              className="h-full"
              bodyClassName="px-0 pb-0"
            >
              {rows.length === 0 && items.length === 0 ? (
                <div className="flex min-h-row items-center px-3 text-text-muted">
                  {t('reportsCalendar.day.nothing')}
                </div>
              ) : (
                <div>
                  {rows.map((row) => {
                    const colour =
                      row.style === null
                        ? undefined
                        : seriesNumber(row.style.colour);
                    const name = row.payee;
                    return (
                      <Row
                        key={row.id}
                        columns={columns}
                        onPress={() => {
                          void navigate({
                            to: '/transactions',
                            search: { entry: row.id },
                          });
                        }}
                        cells={[
                          row.style?.icon == null ? (
                            <IconMoneyDollarCircleLine
                              key="i"
                              className="size-4 text-text-muted"
                            />
                          ) : (
                            <CategoryIcon
                              key="i"
                              name={row.style.icon}
                              {...(colour === undefined
                                ? {}
                                : { color: colour })}
                            />
                          ),
                          <span key="n" className="font-sans">
                            {name}
                          </span>,
                          row.amount === null ? null : (
                            <span key="a" className="block text-right">
                              <Amount
                                amount={row.amount}
                                kind={entryAmountKind(row)}
                                locale={locale}
                              />
                            </span>
                          ),
                        ]}
                      />
                    );
                  })}
                  {items.map((item) => (
                    <Row
                      key={item.key}
                      columns={columns}
                      cells={[
                        itemIcon(item),
                        <span key="n" className="font-sans">
                          {itemName(item)}
                          <span className="text-text-muted">
                            {' · '}
                            {itemKind(item)}
                          </span>
                        </span>,
                        item.type === 'payday' ? null : (
                          <span key="a" className="block text-right">
                            <Amount amount={item.amount} locale={locale} />
                          </span>
                        ),
                      ]}
                    />
                  ))}
                </div>
              )}
            </Tile>
          )
        }
      />
    </Stack>
  );
}

function itemIcon(item: DayItem) {
  const className = 'size-4 text-text-muted';
  switch (item.type) {
    case 'payday':
      return <IconMoneyDollarCircleLine key="i" className={className} />;
    case 'bill':
      return <IconBillLine key="i" className={className} />;
    case 'iou':
      return <IconHandCoinLine key="i" className={className} />;
  }
}

/**
 * The toolbar (`toolbar`): the two layers and what the marks mean.
 */
function LayerBar({
  showHeat,
  setShowHeat,
  showDue,
  setShowDue,
}: {
  showHeat: boolean;
  setShowHeat: (on: boolean) => void;
  showDue: boolean;
  setShowDue: (on: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-r border-b bg-chrome px-3 py-1.5 text-title text-text-muted">
      <span
        role="group"
        aria-label={t('reportsCalendar.layers.label')}
        className="inline-flex border border-outline"
      >
        <ToggleButton
          isSelected={showHeat}
          onChange={setShowHeat}
          className={layerClass}
        >
          {t('reportsCalendar.layers.heat')}
        </ToggleButton>
        <ToggleButton
          isSelected={showDue}
          onChange={setShowDue}
          className={layerClass}
        >
          {t('reportsCalendar.layers.due')}
        </ToggleButton>
      </span>
      <span>{t('reportsCalendar.layers.legend')}</span>
    </div>
  );
}
