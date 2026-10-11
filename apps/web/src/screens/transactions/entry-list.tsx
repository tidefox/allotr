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
import { SummaryLine } from '@/components/stats';
import { CategoryIcon, EmptyState } from '@/components/states';
import { IconMoneyDollarCircleLine } from '@/generated/icons';
import { seriesNumber } from '@/lib/category-style';
import { t } from '@/messages/t';
import type { FilterChip } from './filter-model.ts';
import type { TxRow, TxSection } from './list-model.ts';
import { dropMove, type Move } from './reorder-model.ts';

const columns: readonly RowColumn[] = [
  { width: '2.75rem' },
  { width: 'minmax(0, 1.4fr)' },
  { width: 'minmax(0, 1fr)', from: 'medium' },
  { width: 'minmax(0, 0.7fr)', from: 'wide' },
  // A floor, so columns line up from row to row; a bigger amount still fits.
  { width: 'minmax(7.5rem, auto)' },
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
    <span key="payee" className="flex items-center gap-2">
      {row.style?.icon == null ? (
        <IconMoneyDollarCircleLine
          aria-hidden="true"
          className="size-4 shrink-0 text-text-muted"
        />
      ) : (
        <CategoryIcon
          name={row.style.icon}
          {...(colour === undefined ? {} : { color: colour })}
        />
      )}
      <span className="truncate font-sans">{row.payee}</span>
      {row.bill === null ? null : (
        <Tag className="shrink-0">{t('transactions.list.billTag')}</Tag>
      )}
    </span>,
    <span key="category" className="font-sans text-text-muted">
      {row.category ?? ''}
    </span>,
    <span key="account" className="font-sans text-text-muted">
      {row.account}
    </span>,
    row.amount === null ? null : (
      <Amount key="amount" amount={row.amount} kind={kindOf(row)} />
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
      tall
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
            tall
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
      className="flex flex-wrap items-center gap-1 border-b px-3 py-2"
    >
      {chips.map((chip) => (
        <Chip
          key={chip.key}
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
  summary: readonly string[];
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
        <SummaryLine parts={summary} className="border-b px-3 py-1.5" />
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
          >
            {section.title === null ? null : (
              <h3 className="flex h-row items-center gap-2 border-b bg-chrome px-3 text-small">
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {section.title}
                </span>
                {section.total === null ? null : (
                  <span className="num shrink-0 text-text-muted">
                    {section.total}
                  </span>
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
