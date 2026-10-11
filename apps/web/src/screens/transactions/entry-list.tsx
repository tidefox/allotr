import { useEffect, useRef } from 'react';
import {
  Button,
  GridList,
  GridListItem,
  useDragAndDrop,
} from 'react-aria-components';
import { Amount, type AmountKind } from '@/components/amount';
import { BracketButton, Chip, Tag } from '@/components/buttons';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon, EmptyState } from '@/components/states';
import { IconFilter3Line, IconMoneyDollarCircleLine } from '@/generated/icons';
import { seriesNumber } from '@/lib/category-style';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import type { FilterChip } from './filter-model.ts';
import type { SummaryPart, TxRow, TxSection } from './list-model.ts';
import { dropMove, type Move } from './reorder-model.ts';

// The mockup's row: time, icon, payee, category, account, amount. Time and
// category go below 600 px, the account below 1000 px.
const columns: readonly RowColumn[] = [
  { width: '5ch', from: 'medium' },
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: '18ch', at: { medium: '16ch' }, from: 'medium' },
  { width: '18ch', from: 'wide' },
  { width: '13ch', at: { compact: 'auto' } },
];

function kindOf(row: TxRow): AmountKind {
  if (row.moves) return 'transfer';
  return (row.amount?.amountMinor ?? 0) < 0 ? 'expense' : 'income';
}

function rowCells(row: TxRow) {
  const colour =
    row.style === null ? undefined : seriesNumber(row.style.colour);
  return [
    <span key="time" className="num text-text-muted">
      {row.time ?? t('transactions.list.noTime')}
    </span>,
    row.style?.icon == null ? (
      <IconMoneyDollarCircleLine
        key="icon"
        aria-hidden="true"
        className="block size-4 text-text-muted"
      />
    ) : (
      <CategoryIcon
        key="icon"
        name={row.style.icon}
        {...(colour === undefined ? {} : { color: colour })}
      />
    ),
    <span key="payee" className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-sans">{row.payee}</span>
      {row.bill === null ? null : (
        <Tag className="shrink-0">{t('transactions.list.billTag')}</Tag>
      )}
    </span>,
    <span key="category" className="font-sans text-text-muted">
      {row.categoryParts === null ? (
        (row.category ?? '')
      ) : (
        <>
          {row.categoryParts.parent === null ? null : (
            <span>{row.categoryParts.parent} › </span>
          )}
          {row.categoryParts.name}
        </>
      )}
    </span>,
    <span key="account" className="font-sans text-text-muted">
      {row.account}
    </span>,
    row.amount === null ? null : (
      <span key="amount" className="block text-right">
        <Amount amount={row.amount} kind={kindOf(row)} />
      </span>
    ),
  ];
}

function EntryRow({
  row,
  selected,
  onSelect,
}: {
  row: TxRow;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Row
      className="cv-row"
      columns={columns}
      selected={selected}
      onPress={() => {
        onSelect(row.id);
      }}
      cells={rowCells(row)}
    />
  );
}

/**
 * One day's rows as a list that can be reordered (docs/ui.md §5, moving
 * items): drag a row with the mouse, long-press then drag on touch, or
 * focus a row, press → to reach its drag key and use the arrows. There is
 * no visible handle. The entry's own detail has move up and move down.
 */
function MovableDay({
  label,
  rows,
  selectedId,
  busy,
  onSelect,
  onMove,
}: {
  label: string;
  rows: readonly TxRow[];
  selectedId: string | undefined;
  busy: boolean;
  onSelect: (id: string) => void;
  onMove: (move: Move) => void;
}) {
  const ids = rows.map((row) => row.id);
  const { dragAndDropHooks } = useDragAndDrop({
    isDisabled: busy,
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder: (event) => {
      const move = dropMove(
        ids,
        new Set([...event.keys].map(String)),
        String(event.target.key),
        event.target.dropPosition === 'before' ? 'before' : 'after',
      );
      if (move !== null) onMove(move);
    },
  });
  return (
    <GridList
      aria-label={label}
      dragAndDropHooks={dragAndDropHooks}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={selectedId === undefined ? [] : [selectedId]}
      onSelectionChange={(keys) => {
        const [first] = keys === 'all' ? [] : [...keys];
        if (first !== undefined) onSelect(String(first));
      }}
    >
      {rows.map((row) => (
        <GridListItem
          key={row.id}
          id={row.id}
          textValue={row.payee}
          className="press relative block cursor-pointer outline-none data-[dragging]:bg-card data-[drop-target]:bg-card"
        >
          <Button
            slot="drag"
            className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-0 focus-visible:right-0 focus-visible:z-10 focus-visible:bg-chrome focus-visible:px-2 focus-visible:text-small focus-visible:text-primary"
          >
            ⠿
          </Button>
          <Row
            className="cv-row"
            columns={columns}
            selected={row.id === selectedId}
            cells={rowCells(row)}
          />
        </GridListItem>
      ))}
    </GridList>
  );
}

/** The chip bar above the list: one chip per active filter, and a clear. */
export function ChipBar({
  chips,
  onRemove,
  onClear,
}: {
  chips: readonly FilterChip[];
  onRemove: (key: string) => void;
  onClear: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t('transactions.list.chips')}
      className="flex flex-wrap items-center gap-1.5 border-r border-b bg-chrome px-3 py-1.5 text-small text-text-muted"
    >
      <IconFilter3Line aria-hidden="true" className="size-4 shrink-0" />
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          kind={chipKind(chip.key)}
          label={chip.label}
          removeLabel={t('transactions.filter.remove', { label: chip.label })}
          onRemove={() => {
            onRemove(chip.key);
          }}
        />
      ))}
      <BracketButton onPress={onClear}>
        {t('transactions.list.clear')}
      </BracketButton>
    </div>
  );
}

/** The muted word before a chip's value; search and payee name themselves. */
function chipKind(key: string): string | undefined {
  if (key === 'type') return t('transactions.filter.kinds.type');
  if (key.startsWith('category:'))
    return t('transactions.filter.kinds.category');
  if (key.startsWith('account:')) return t('transactions.filter.kinds.account');
  return undefined;
}

export function EntryList({
  summary,
  sections,
  selectedId,
  filtered,
  onSelect,
  hasMore,
  loadingMore,
  onLoadMore,
  movable,
  moving,
  onMove,
}: {
  summary: readonly SummaryPart[];
  sections: readonly TxSection[];
  selectedId: string | undefined;
  filtered: boolean;
  onSelect: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** The days whose rows can be dragged (section keys). */
  movable: ReadonlySet<string>;
  moving: boolean;
  onMove: (move: Move) => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (el === null || !hasMore || typeof IntersectionObserver === 'undefined')
      return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting === true) onLoadMore();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, onLoadMore, sections]);

  const empty = sections.every((s) => s.rows.length === 0);
  return (
    <div>
      {summary.length === 0 ? null : (
        <p className="flex flex-wrap gap-x-[1.125rem] gap-y-1 px-3 pt-0.5 pb-1.5 text-small text-text-muted">
          {summary.map((part) => {
            const value = (
              <b
                className={cn(
                  'num font-semibold',
                  part.tone === 'positive' ? 'text-positive' : 'text-text',
                )}
              >
                {part.value}
              </b>
            );
            return (
              <span key={part.key}>
                {part.valueFirst ? (
                  <>
                    {value} {part.label}
                  </>
                ) : (
                  <>
                    {part.label} {value}
                  </>
                )}
              </span>
            );
          })}
        </p>
      )}
      {empty ? (
        <EmptyState
          title={t(
            filtered
              ? 'transactions.list.emptyFiltered'
              : 'transactions.list.empty',
          )}
          hint={t(
            filtered
              ? 'transactions.list.emptyFilteredHint'
              : 'transactions.list.emptyHint',
          )}
        />
      ) : (
        sections.map((section) => (
          <section
            key={section.key}
            aria-label={section.title ?? t('transactions.list.title')}
            // Seams run between rows only: a group's last row has none.
            className="[&>:last-child]:border-b-0 [&_[role=row]:last-child>:last-child]:border-b-0"
          >
            {section.title === null ? null : (
              <h3 className="sticky top-0 z-[1] flex items-center gap-2 border-b border-outline bg-canvas px-3 pt-2.5 pb-1 text-small text-text-muted">
                <span className="min-w-0 flex-1 truncate font-semibold text-text">
                  {section.title}
                </span>
                {section.total === null ? null : (
                  <span className="num shrink-0">{section.total}</span>
                )}
              </h3>
            )}
            {movable.has(section.key) ? (
              <MovableDay
                label={t('transactions.reorder.day', {
                  day: section.title ?? '',
                })}
                rows={section.rows}
                selectedId={selectedId}
                busy={moving}
                onSelect={onSelect}
                onMove={onMove}
              />
            ) : (
              section.rows.map((row) => (
                <EntryRow
                  key={row.id}
                  row={row}
                  selected={row.id === selectedId}
                  onSelect={onSelect}
                />
              ))
            )}
          </section>
        ))
      )}
      {hasMore ? (
        <div ref={sentinel} className="border-b px-3 py-1">
          <BracketButton isDisabled={loadingMore} onPress={onLoadMore}>
            {t(
              loadingMore
                ? 'transactions.list.loadingMore'
                : 'transactions.list.more',
            )}
          </BracketButton>
        </div>
      ) : null}
    </div>
  );
}
