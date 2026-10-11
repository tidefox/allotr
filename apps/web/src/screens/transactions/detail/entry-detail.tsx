import {
  useMutation,
  useQuery,
  useQueryClient,
  queryOptions,
} from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type ComponentType, type ReactNode } from 'react';
import type {
  CategoryView,
  TransactionDetailView,
  TransactionView,
} from '@allotr/shared';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import {
  BracketButton,
  Brackets,
  bracketClass,
  Tag,
} from '@/components/buttons';
import { Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon } from '@/components/states';
import {
  IconArrowDownLine,
  IconArrowUpLine,
  IconDeleteBinLine,
  IconFileList3Line,
  IconGroupLine,
  IconMoneyDollarCircleLine,
  IconPencilLine,
  IconRefreshLine,
  IconScissorsCutLine,
  IconSwapLine,
  type IconProps,
} from '@/generated/icons';
import { rateText } from '@/features/ledger/format';
import { formatTerminalDate, formatTerminalDay } from '@/features/today/format';
import { ledgerRows } from '@/features/ledger/rows';
import { isEditable } from '@/features/ledger/edit-draft';
import { call } from '@/lib/api';
import { budgetsQuery } from '@/lib/budgets';
import { seriesNumber } from '@/lib/category-style';
import { endpoints } from '@/lib/endpoints';
import {
  allAccountsQuery,
  allCategoriesQuery,
  entryQuery,
  entryQueryKeys,
  restoreTransaction,
  reverseTransaction,
  revertTransaction,
} from '@/lib/ledger';
import { formatMoney } from '@/lib/format-money';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { CoverSheet } from './cover-sheet.tsx';
import {
  coverLine,
  coverParts,
  type CoverLine,
  entryDetail,
  isCovered,
  type EntryDetailModel,
} from './detail-model.ts';
import { EditSheet } from './edit-sheet.tsx';
import { IouSheet } from './iou-sheet.tsx';
import type { Move } from '../reorder-model.ts';

const locale = 'en';

/**
 * One entry in full (docs/ui.md §6): what it is, its budget and cover, its
 * history and other entries from the same payee, then the actions. The list
 * renders it in the pane (≥ 1000 px) or in a sheet and owns the selection;
 * `onOpen` selects another entry (a version, a copy, the edited entry).
 */
export function EntryDetail({
  entryId,
  onOpen,
  order,
  bare = false,
}: {
  entryId: string;
  /** Selects another entry (a version, a copy, the edited entry). */
  onOpen: (id: string) => void;
  /** The entry's place in its day, when the list can move it. */
  order?: DayOrder | undefined;
  /** In a sheet: the body only, the sheet's title names the payee. */
  bare?: boolean;
}) {
  const entry = useQuery(entryQuery(entryId));
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);

  if (entry.isError || accounts.isError || categories.isError) {
    const failed = (
      <div role="alert" className="flex flex-col items-start gap-2 py-3">
        <p className="text-small">{t('transactionDetail.failed')}</p>
        <BracketButton
          onPress={() => {
            void entry.refetch();
            void accounts.refetch();
            void categories.refetch();
          }}
        >
          {t('transactionDetail.retry')}
        </BracketButton>
      </div>
    );
    return (
      <DetailFrame bare={bare} icon={undefined}>
        {failed}
      </DetailFrame>
    );
  }
  if (
    entry.data === undefined ||
    accounts.data === undefined ||
    categories.data === undefined
  ) {
    return <SkeletonTile />;
  }

  const model = entryDetail(
    entry.data,
    accounts.data.accounts,
    categories.data.categories,
  );
  return (
    <DetailFrame bare={bare} icon={IconFileList3Line}>
      <DetailBody
        entry={entry.data}
        model={model}
        categories={categories.data.categories}
        onOpen={onOpen}
        order={order}
      />
    </DetailFrame>
  );
}

/** The `entry` tile (primary edge) beside the list, or a plain region in a sheet. */
function DetailFrame({
  bare,
  icon,
  children,
}: {
  bare: boolean;
  icon: ComponentType<IconProps> | undefined;
  children: ReactNode;
}) {
  if (bare) {
    return (
      <section
        aria-label={t('transactionDetail.title')}
        className="px-3 py-2.5"
      >
        {children}
      </section>
    );
  }
  return (
    <Tile
      title={t('transactionDetail.title')}
      icon={icon}
      primary
      className="h-full"
    >
      {children}
    </Tile>
  );
}

/** Moves within the entry's day; null for a step past an edge. */
export interface DayOrder {
  up: Move | null;
  down: Move | null;
  busy: boolean;
  /** A filter or search hides entries of the day, so moves are off. */
  blocked: boolean;
  onMove: (move: Move) => void;
}

function DetailBody({
  entry,
  model,
  categories,
  onOpen,
  order,
}: {
  order: DayOrder | undefined;
  entry: TransactionDetailView;
  model: EntryDetailModel;
  categories: readonly CategoryView[];
  onOpen: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<'edit' | 'split' | 'iou' | 'cover' | null>(
    null,
  );
  const { row } = model;
  const refresh = () => {
    for (const queryKey of entryQueryKeys)
      void queryClient.invalidateQueries({ queryKey });
  };
  const remove = useMutation({
    mutationFn: () => reverseTransaction(entry.id),
    onSuccess: refresh,
  });
  // Only an entry whose budget did not pay it all has a cover to choose.
  const covered = coverLine(entry.budget?.lines) !== undefined;
  const restore = useMutation({
    mutationFn: () => restoreTransaction(entry.id),
    onSuccess: (copy) => {
      refresh();
      onOpen(copy.id);
    },
  });

  const style = row.style;
  const colour = style === null ? undefined : seriesNumber(style.colour);
  const icon =
    style?.icon == null ? (
      <IconMoneyDollarCircleLine
        aria-hidden="true"
        className="size-4 shrink-0 text-text-muted"
      />
    ) : (
      <CategoryIcon
        name={style.icon}
        {...(colour === undefined ? {} : { color: colour })}
      />
    );
  const amountKind =
    row.moves || row.amount === null
      ? 'transfer'
      : row.amount.amountMinor < 0
        ? 'expense'
        : 'income';
  const rate = rateText(entry);
  const editable = isEditable(entry);
  const lines = entry.budget?.lines ?? [];

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 font-sans font-semibold">
          {icon}
          <span className="truncate">
            {model.payee ?? t('transactionDetail.noPayee')}
          </span>
          {model.deleted ? (
            <Tag tone="negative">{t('transactionDetail.tags.deleted')}</Tag>
          ) : null}
          {model.edited ? (
            <Tag>{t('transactionDetail.tags.edited')}</Tag>
          ) : null}
        </h3>
        {row.amount === null ? null : (
          <span className="shrink-0 text-[1.25rem]">
            <Amount amount={row.amount} kind={amountKind} locale={locale} />
          </span>
        )}
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5">
        <Field label={t('transactionDetail.fields.date')}>
          {entry.occurredTime === null
            ? formatTerminalDay(entry.occurredOn, locale)
            : t('transactionDetail.fields.dateTime', {
                date: formatTerminalDay(entry.occurredOn, locale),
                time: entry.occurredTime.slice(0, 5),
              })}
        </Field>
        <Field label={t('transactionDetail.fields.category')}>
          {model.categoryPath === null ? (
            t('transactionDetail.fields.noCategory')
          ) : (
            <span className="inline-flex max-w-full items-center gap-[5px] align-bottom">
              {style?.icon == null ? null : icon}
              <span className="truncate">{model.categoryPath}</span>
            </span>
          )}
        </Field>
        <Field
          label={
            model.accounts.length > 1
              ? t('transactionDetail.fields.accounts')
              : t('transactionDetail.fields.account')
          }
        >
          {model.accounts.join(' → ')}
        </Field>
        {rate === null ? null : (
          <Field label={t('transactionDetail.fields.rate')}>{rate}</Field>
        )}
        {entry.budget === null ? null : (
          <>
            {lines.map((line, index) => (
              <Field
                key={index}
                label={index === 0 ? t('transactionDetail.budget.title') : ''}
              >
                {budgetText(line)}
              </Field>
            ))}
            <Field label={t('transactionDetail.cover.title')} muted={!covered}>
              {coverText(lines)}
            </Field>
          </>
        )}
        <Field label={t('transactionDetail.fields.source')} muted>
          {t(`transactionDetail.sources.${entry.source}`)}
        </Field>
        <Field label={t('transactionDetail.history.title')} muted>
          {historyText(entry)}
        </Field>
      </dl>

      <History entry={entry} onOpen={onOpen} onChanged={refresh} />

      {model.payee === null || entry.kind !== 'expense' ? null : (
        <SamePayee
          payee={model.payee}
          entryId={entry.id}
          categories={categories}
          onOpen={onOpen}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t pt-2.5">
        {model.canEdit ? (
          <BracketButton
            icon={IconPencilLine}
            onPress={() => {
              setSheet('edit');
            }}
          >
            {t('transactionDetail.actions.edit')}
          </BracketButton>
        ) : null}
        {model.canSplit ? (
          <BracketButton
            icon={IconScissorsCutLine}
            onPress={() => {
              setSheet('split');
            }}
          >
            {t('transactionDetail.actions.split')}
          </BracketButton>
        ) : null}
        {model.canIou ? (
          <BracketButton
            icon={IconGroupLine}
            onPress={() => {
              setSheet('iou');
            }}
          >
            {t('transactionDetail.actions.iou')}
          </BracketButton>
        ) : null}
        {model.canCover && covered ? (
          <BracketButton
            icon={IconSwapLine}
            onPress={() => {
              setSheet('cover');
            }}
          >
            {t('transactionDetail.actions.cover')}
          </BracketButton>
        ) : null}
        {order === undefined ? null : (
          <>
            <BracketButton
              icon={IconArrowUpLine}
              isDisabled={order.up === null || order.busy || order.blocked}
              onPress={() => {
                if (order.up !== null) order.onMove(order.up);
              }}
            >
              {t('transactionDetail.order.up')}
            </BracketButton>
            <BracketButton
              icon={IconArrowDownLine}
              isDisabled={order.down === null || order.busy || order.blocked}
              onPress={() => {
                if (order.down !== null) order.onMove(order.down);
              }}
            >
              {t('transactionDetail.order.down')}
            </BracketButton>
          </>
        )}
        {model.canDelete ? (
          <BracketButton
            tone="destructive"
            icon={IconDeleteBinLine}
            isDisabled={remove.isPending}
            onPress={() => {
              remove.mutate();
            }}
          >
            {t('transactionDetail.actions.delete')}
          </BracketButton>
        ) : null}
        {model.canRestore ? (
          <BracketButton
            icon={IconRefreshLine}
            isDisabled={restore.isPending}
            onPress={() => {
              restore.mutate();
            }}
          >
            {t('transactionDetail.actions.restore')}
          </BracketButton>
        ) : null}
        {order?.blocked === true ? (
          <p data-order-blocked className="w-full text-small text-text-muted">
            {t('transactionDetail.order.blocked')}
          </p>
        ) : null}
      </div>
      {remove.isSuccess && model.deleted ? (
        <p role="status" className="pt-2 text-small text-text-muted">
          {t('transactionDetail.deleted')}
        </p>
      ) : null}
      {remove.isError || restore.isError ? (
        <p role="alert" className="pt-2 text-small text-negative">
          {t('transactionDetail.actionFailed')}
        </p>
      ) : null}

      {(sheet === 'edit' || sheet === 'split') && editable ? (
        <EditSheet
          entry={entry}
          split={sheet === 'split'}
          onClose={() => {
            setSheet(null);
          }}
          onSaved={(id) => {
            setSheet(null);
            onOpen(id);
          }}
        />
      ) : null}
      {sheet === 'iou' && model.canIou ? (
        <IouSheet
          entry={entry}
          onClose={() => {
            setSheet(null);
          }}
          onSaved={(id) => {
            setSheet(null);
            onOpen(id);
          }}
        />
      ) : null}
      {sheet === 'cover' ? (
        <CoverSheetLoader
          entryId={entry.id}
          line={coverLine(entry.budget?.lines)}
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
    </>
  );
}

/** A key-value row (`kv`): muted key, value right-aligned on one line. */
function Field({
  label,
  muted = false,
  children,
}: {
  label: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate text-right font-sans',
          muted && 'text-text-muted',
        )}
      >
        {children}
      </dd>
    </>
  );
}

/** A section label inside the detail (`sect`). */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-3 mb-1 text-tiny tracking-[0.04em] text-text-muted uppercase">
      {children}
    </h3>
  );
}

/** `Cafe budget · $12.00 left after`: the server's figure for one line. */
function budgetText(line: CoverLine): string {
  const name = line.budgetName ?? t('transactionDetail.budget.none');
  if (line.leftAfter === null) return name;
  return t('transactionDetail.budget.line', {
    name,
    left: t('transactionDetail.budget.leftAfter', {
      left: formatMoney(line.leftAfter, 'symbol', locale),
    }),
  });
}

/** Who paid past the budget, as the server split it; `none` when nobody. */
function coverText(lines: readonly CoverLine[]): string {
  const parts = lines.filter(isCovered).flatMap((line) => [
    ...coverParts(line).map((c) =>
      t('transactionDetail.cover.from', {
        name: c.name,
        amount: formatMoney(c.amount, 'symbol', locale),
      }),
    ),
    ...(line.uncovered.amountMinor === 0
      ? []
      : [
          t('transactionDetail.cover.uncovered', {
            amount: formatMoney(line.uncovered, 'symbol', locale),
          }),
        ]),
    ...(line.overridden ? [t('transactionDetail.cover.chosen')] : []),
  ]);
  return parts.length === 0
    ? t('transactionDetail.cover.none')
    : parts.join(' · ');
}

/** The history line: what edits, deletes and restores left. */
function historyText(entry: TransactionView): string {
  if (entry.reversedById !== null)
    return t('transactionDetail.history.deletedSince');
  if (entry.replacedById !== null)
    return t('transactionDetail.history.replaced');
  if (entry.replacesId !== null) return t('transactionDetail.history.earlier');
  if (entry.restoredById !== null)
    return t('transactionDetail.history.restoredAs');
  return t('transactionDetail.history.none');
}

function CoverSheetLoader({
  entryId,
  line,
  onClose,
}: {
  entryId: string;
  line: CoverLine | undefined;
  onClose: () => void;
}) {
  const budgets = useQuery(budgetsQuery);
  if (line === undefined || budgets.data === undefined) return null;
  return (
    <CoverSheet
      entryId={entryId}
      line={line}
      order={budgets.data.coverOrder}
      onClose={onClose}
    />
  );
}

/**
 * The versions an edit left behind, newest first, each followed by the one it
 * replaced; and what became of this entry if it was deleted or replaced.
 */
function History({
  entry,
  onOpen,
  onChanged,
}: {
  entry: TransactionView;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const hasHistory =
    entry.replacesId !== null ||
    entry.replacedById !== null ||
    entry.reversedById !== null ||
    entry.restoredById !== null;
  if (!hasHistory) return null;
  return (
    <section
      aria-label={t('transactionDetail.history.title')}
      className="-mx-3 flex flex-col"
    >
      <div className="px-3">
        <SectionTitle>{t('transactionDetail.history.title')}</SectionTitle>
      </div>
      {entry.replacedById === null ? null : (
        <LinkRow
          label={t('transactionDetail.tags.edited')}
          open={t('transactionDetail.history.open')}
          onPress={() => {
            onOpen(entry.replacedById ?? '');
          }}
        />
      )}
      {entry.reversedById === null ? null : (
        <LinkRow
          label={t('transactionDetail.history.deletedBy')}
          open={t('transactionDetail.history.open')}
          onPress={() => {
            onOpen(entry.reversedById ?? '');
          }}
        />
      )}
      {entry.restoredById === null ? null : (
        <LinkRow
          label={t('transactionDetail.history.restoredAs')}
          open={t('transactionDetail.history.open')}
          onPress={() => {
            onOpen(entry.restoredById ?? '');
          }}
        />
      )}
      {entry.replacesId === null ? null : (
        <Version
          id={entry.replacesId}
          n={1}
          current={entry.replacedById === null}
          onOpen={onOpen}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}

function LinkRow({
  label,
  open,
  onPress,
}: {
  label: string;
  open: string;
  onPress: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b px-3">
      <span className="min-w-0 flex-1 truncate font-sans">{label}</span>
      <BracketButton onPress={onPress}>{open}</BracketButton>
    </div>
  );
}

const versionColumns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
  { width: 'auto' },
];

/** One earlier version, and (below it) the one it replaced. */
function Version({
  id,
  n,
  current,
  onOpen,
  onChanged,
}: {
  id: string;
  n: number;
  /** The entry on screen is the newest version, so reverting is allowed. */
  current: boolean;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const version = useQuery(entryQuery(id));
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);
  const revert = useMutation({
    mutationFn: () => revertTransaction(id),
    onSuccess: (edited) => {
      onChanged();
      onOpen(edited.replacement.id);
    },
  });
  if (
    version.data === undefined ||
    accounts.data === undefined ||
    categories.data === undefined
  )
    return null;
  const [row] = ledgerRows(
    [version.data],
    accounts.data.accounts,
    categories.data.categories,
  );
  return (
    <>
      <Row
        columns={versionColumns}
        cells={[
          <span key="when" className="font-sans">
            {t('transactionDetail.history.version', { n })} ·{' '}
            {formatTerminalDay(version.data.occurredOn, locale)}
          </span>,
          row?.amount == null ? null : (
            <Amount
              key="amount"
              amount={row.amount}
              kind={row.moves ? 'transfer' : 'plain'}
              locale={locale}
            />
          ),
          current ? (
            <BracketButton
              key="revert"
              isDisabled={revert.isPending}
              onPress={() => {
                revert.mutate();
              }}
            >
              {t('transactionDetail.history.revert')}
            </BracketButton>
          ) : null,
        ]}
      />
      {version.data.replacesId === null ? null : (
        <Version
          id={version.data.replacesId}
          n={n + 1}
          current={current}
          onOpen={onOpen}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

const SAME_PAYEE_SHOWN = 3;

// Other entries from the payee: the report's own match (`payee` with
// `type=expense` and `undone=hide`), newest first, no period.
function samePayeeQuery(payee: string) {
  return queryOptions({
    queryKey: ['transactions', 'payee', payee],
    queryFn: () =>
      call(endpoints.transactions, {
        query: {
          payee,
          type: 'expense',
          undone: 'hide',
          limit: SAME_PAYEE_SHOWN + 1,
        },
      }),
  });
}

const payeeColumns: readonly RowColumn[] = [
  { width: '7ch' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
];

function SamePayee({
  payee,
  entryId,
  categories,
  onOpen,
}: {
  payee: string;
  entryId: string;
  categories: readonly CategoryView[];
  onOpen: (id: string) => void;
}) {
  const others = useQuery(samePayeeQuery(payee));
  const accounts = useQuery(allAccountsQuery);
  if (others.data === undefined || accounts.data === undefined) return null;
  const rows = ledgerRows(
    others.data.transactions.filter((e) => e.id !== entryId),
    accounts.data.accounts,
    categories,
  ).slice(0, SAME_PAYEE_SHOWN);
  return (
    <section
      aria-label={t('transactionDetail.payee.title')}
      className="-mx-3 flex flex-col [&>:last-child]:border-b-0"
    >
      <div className="flex items-center justify-between gap-2 px-3">
        <SectionTitle>{t('transactionDetail.payee.title')}</SectionTitle>
        {rows.length === 0 ? null : (
          <Link
            to="/transactions"
            search={{ payee, type: 'expense', period: 'all' }}
            className={cn(bracketClass, 'mt-2')}
          >
            <Brackets>{t('transactionDetail.payee.all')}</Brackets>
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="flex min-h-row items-center px-3 text-text-muted">
          {t('transactionDetail.payee.empty')}
        </p>
      ) : (
        rows.map((other) => (
          <Row
            key={other.id}
            columns={payeeColumns}
            onPress={() => {
              onOpen(other.id);
            }}
            cells={[
              <span key="day" className="text-text-muted">
                {formatTerminalDate(other.occurredOn, locale)}
              </span>,
              <span key="account" className="font-sans text-text-muted">
                {other.accounts.join(' → ')}
              </span>,
              other.amount === null ? null : (
                <Amount
                  key="amount"
                  amount={other.amount}
                  kind="expense"
                  locale={locale}
                />
              ),
            ]}
          />
        ))
      )}
    </section>
  );
}
