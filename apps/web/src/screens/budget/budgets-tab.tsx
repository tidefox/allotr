import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  addDays,
  money,
  type BudgetStatusView,
  type BudgetView,
  type CategoryView,
} from '@allotr/shared';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, Brackets, bracketClass } from '@/components/buttons';
import { Grid, SectionTitle, Stack, Tile } from '@/components/layout';
import { MenuButton, MenuItem } from '@/components/menu';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon, EmptyState } from '@/components/states';
import { useFrameWidth } from '@/components/use-frame-width';
import { ChartLegend } from '@/charts/chart';
import {
  IconAddLine,
  IconArrowUpDownLine,
  IconCoinsLine,
  IconMore2Line,
  IconPieChart2Line,
  IconWallet3Line,
} from '@/generated/icons';
import { canDelete } from '@/features/budget/budget-draft';
import { formatTerminalDate } from '@/features/today/format';
import { budgetsQuery, coversQuery } from '@/lib/budgets';
import { categoriesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { CycleAllocationTile } from '../dashboard/tiles/cycle-allocation.tsx';
import {
  budgetRows,
  periodPace,
  type BudgetRow,
} from '../dashboard/tiles/budgets.ts';
import { TileFailed } from '../dashboard/tiles/tile-failed.tsx';
import { BudgetConfirmSheet } from './budget-confirm-sheet.tsx';
import { BudgetLine } from './budget-line.tsx';
import { BudgetSheet, type BudgetSheetMode } from './budget-sheet.tsx';
import { freeCategories, subCandidates } from './budgets-model.ts';
import { openBudgetSheet } from './sheets/store.ts';

const locale = 'en';

// Lead, icon, name, bar, spent, left, action. Phones drop the spent column
// (left is the figure to act on) and narrow the bar.
const columns: readonly RowColumn[] = [
  { width: '1.5rem' },
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'minmax(3.75rem, 2.4fr)', at: { compact: 'minmax(2.25rem, 1fr)' } },
  { width: '9ch', from: 'medium' },
  { width: '9ch' },
  { width: '8ch' },
];

// The server's totals under the tree: a label, then the figure under the
// last money column (left, on every frame).
const totalColumns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: '9ch' },
  { width: '8ch' },
];

type Open =
  | Readonly<{ sheet: BudgetSheetMode }>
  | Readonly<{ confirm: 'end' | 'delete'; budget: BudgetView }>;

// Budgets (docs/ui.md §6): the cycle allocation, the budget tree and who
// covered overspending this period. Every figure is the server's; the tree
// only groups budgets under their parent category.
export function BudgetsTab() {
  const status = useQuery(budgetsQuery);
  const categories = useQuery(categoriesQuery);
  const [open, setOpen] = useState<Open | null>(null);
  // On a phone the budgets come first: the allocation alone would fill the
  // first screen. From 600 px it leads, as the cycle's overview.
  const compact = useFrameWidth() < 600;

  if (status.isError) {
    return (
      <Stack className="min-h-full">
        <Tile title={t('budgetBudgets.tree.title')} icon={IconPieChart2Line}>
          <TileFailed
            retry={() => {
              void status.refetch();
            }}
          />
        </Tile>
      </Stack>
    );
  }
  if (status.data === undefined) {
    return (
      <Grid className="min-h-full">
        <SkeletonTile span="full" />
        <SkeletonTile span={2} rows={5} />
        <SkeletonTile rows={4} />
      </Grid>
    );
  }
  const data = status.data;
  const cats = categories.data?.categories ?? [];
  return (
    <>
      <Grid className="min-h-full">
        {compact ? null : <CycleAllocationTile />}
        <TreeTile data={data} categories={cats} onOpen={setOpen} />
        {compact ? <CycleAllocationTile /> : null}
        <CoverTile data={data} categories={cats} />
      </Grid>
      {open === null ? null : 'sheet' in open ? (
        <BudgetSheet
          mode={open.sheet}
          currency={data.available.currency}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : (
        <BudgetConfirmSheet
          action={open.confirm}
          budget={open.budget}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

/** "sep 25 – oct 22": the period's first and last day (`to` is exclusive). */
function periodText(period: BudgetStatusView['period']): string {
  return t('budgetBudgets.tree.period', {
    from: formatTerminalDate(period.from, locale),
    to: formatTerminalDate(addDays(period.to, -1), locale),
  });
}

function TreeTile({
  data,
  categories,
  onOpen,
}: {
  data: BudgetStatusView;
  categories: readonly CategoryView[];
  onOpen: (open: Open) => void;
}) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(() => budgetRows(data, categories), [data, categories]);
  const shown = rows.filter(
    (row) =>
      (row.role !== 'child' && row.role !== 'last-child') ||
      !folded.has(row.group),
  );
  const pace = periodPace(data);
  const toggle = (group: string) => {
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });
  };
  return (
    <Tile
      title={t('budgetBudgets.tree.title')}
      icon={IconPieChart2Line}
      subtitle={t('budgetBudgets.tree.subtitle', {
        period: periodText(data.period),
      })}
      span={2}
      bodyClassName="px-0"
      actions={
        <>
          <BracketButton
            icon={IconAddLine}
            aria-label={t('budgetBudgets.tree.addLabel')}
            onPress={() => {
              onOpen({
                sheet: {
                  kind: 'create',
                  categories: freeCategories(data.budgets, categories),
                },
              });
            }}
          >
            {t('budgetBudgets.tree.add')}
          </BracketButton>
          <BracketButton
            onPress={() => {
              openBudgetSheet('payday');
            }}
          >
            {t('budgetBudgets.tree.plan')}
          </BracketButton>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title={t('budgetBudgets.tree.emptyTitle')}
          hint={t('budgetBudgets.tree.emptyHint')}
        />
      ) : (
        <>
          {shown.map((row) => (
            <BudgetLine
              key={row.id}
              row={row}
              pace={pace?.fraction}
              expanded={!folded.has(row.group)}
              onToggle={() => {
                toggle(row.group);
              }}
              foldLabel={t('budgetBudgets.tree.fold', { name: row.name })}
              setAsideLabel={t('budgetBudgets.tree.setAside')}
              barLabel={t('budgetBudgets.tree.barLabel', { name: row.name })}
              columns={columns}
              action={
                <RowAction
                  row={row}
                  data={data}
                  categories={categories}
                  onOpen={onOpen}
                />
              }
            />
          ))}
          <Totals data={data} />
          {pace === null ? null : (
            <ChartLegend
              className="px-3"
              items={[
                {
                  label: t('budgetBudgets.tree.pace', {
                    day: pace.day,
                    length: pace.length,
                  }),
                  mark: 'tick',
                  color: 'bg-text',
                },
              ]}
            />
          )}
        </>
      )}
    </Tile>
  );
}

/**
 * A parent header gets `[+ sub]`; a budget gets `[⋮]` (edit, add a
 * sub-budget, end, delete).
 */
function RowAction({
  row,
  data,
  categories,
  onOpen,
}: {
  row: BudgetRow;
  data: BudgetStatusView;
  categories: readonly CategoryView[];
  onOpen: (open: Open) => void;
}): ReactNode {
  const { budget } = row;
  if (budget === null) {
    // A header with no budget of its own: a new budget on one of its free
    // subcategories.
    const parentId = row.categoryId;
    const free =
      parentId === null
        ? []
        : freeCategories(data.budgets, categories).filter(
            (c) => c.parentId === parentId,
          );
    if (free.length === 0) return null;
    return (
      <span className="flex justify-end">
        <BracketButton
          icon={IconAddLine}
          aria-label={t('budgetBudgets.tree.addSubOf', { name: row.name })}
          onPress={() => {
            onOpen({ sheet: { kind: 'create', categories: free } });
          }}
        >
          {t('budgetBudgets.tree.addSub')}
        </BracketButton>
      </span>
    );
  }
  const subs = subCandidates(budget, data.budgets, categories);
  return (
    <span className="flex justify-end">
      <RowMenu
        budget={budget}
        periodFrom={data.period.from}
        onOpen={onOpen}
        {...(subs.length === 0
          ? {}
          : {
              addSub: () => {
                onOpen({
                  sheet: { kind: 'sub', parent: budget, categories: subs },
                });
              },
            })}
      />
    </span>
  );
}

function RowMenu({
  budget,
  periodFrom,
  addSub,
  onOpen,
}: {
  budget: BudgetView;
  periodFrom: string;
  addSub?: () => void;
  onOpen: (open: Open) => void;
}) {
  const buffer = budget.target.kind === 'buffer';
  return (
    <MenuButton
      variant="bracket"
      icon={IconMore2Line}
      label={t('budgetBudgets.tree.actionsOf', { name: budget.name })}
      title={budget.name}
    >
      <MenuItem
        id="edit"
        label={t('budgetBudgets.menu.edit')}
        onAction={() => {
          onOpen({ sheet: { kind: 'edit', budget } });
        }}
      />
      {addSub === undefined ? null : (
        <MenuItem
          id="sub"
          label={t('budgetBudgets.menu.addSub')}
          onAction={addSub}
        />
      )}
      {buffer ? null : (
        <MenuItem
          id="end"
          label={t('budgetBudgets.menu.end')}
          onAction={() => {
            onOpen({ confirm: 'end', budget });
          }}
        />
      )}
      {canDelete(budget, periodFrom) ? (
        <MenuItem
          id="delete"
          destructive
          label={t('budgetBudgets.menu.delete')}
          onAction={() => {
            onOpen({ confirm: 'delete', budget });
          }}
        />
      ) : null}
    </MenuButton>
  );
}

/** The server's own totals; the browser adds nothing up. */
function Totals({ data }: { data: BudgetStatusView }) {
  const lines = [
    ['daily', t('budgetBudgets.tree.totalDaily'), data.dailyLeft],
    ['held', t('budgetBudgets.tree.totalHeld'), data.held],
    ['unbudgeted', t('budgetBudgets.tree.totalUnbudgeted'), data.unbudgeted],
    ['free', t('budgetBudgets.tree.totalFree'), data.free],
  ] as const;
  return (
    <div className="border-t border-outline text-text-muted">
      <Row
        columns={columns}
        className="border-b-0"
        cells={[
          null,
          null,
          <span key="l" className="font-sans">
            {t('budgetBudgets.tree.total')}
          </span>,
          null,
          <span key="s" className="block text-right">
            <Amount amount={data.totals.spent} />
          </span>,
          <span key="a" className="block text-right">
            <Amount amount={data.totals.left} />
          </span>,
          null,
        ]}
      />
      {lines.map(([id, label, amount]) => (
        <Row
          key={id}
          columns={totalColumns}
          className="border-b-0"
          cells={[
            <span key="l" className="font-sans">
              {label}
            </span>,
            <span key="a" className="block text-right">
              <Amount amount={amount} />
            </span>,
            null,
          ]}
        />
      ))}
    </div>
  );
}

const coverColumns: readonly RowColumn[] = [
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
];

const nextColumns: readonly RowColumn[] = [
  { width: '3ch' },
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
];

type CoverLine = Readonly<{
  key: string;
  row: BudgetRow | undefined;
  name: string;
  source: string | null;
  amount: ReturnType<typeof money>;
}>;

function CoverTile({
  data,
  categories,
}: {
  data: BudgetStatusView;
  categories: readonly CategoryView[];
}) {
  const covers = useQuery(coversQuery);
  const rows = useMemo(() => budgetRows(data, categories), [data, categories]);
  const byBudget = new Map(
    rows.flatMap((row) => (row.budget === null ? [] : [[row.budget.id, row]])),
  );
  const budgetById = new Map(data.budgets.map((b) => [b.id, b]));
  // One line per source that covered an entry, and one for what nothing
  // covered; amounts are the server's, shown as money going out.
  const lines: CoverLine[] = (covers.data?.covers ?? []).flatMap((line) => {
    const budget =
      line.budgetId === null ? undefined : budgetById.get(line.budgetId);
    const name =
      budget?.name ??
      (line.loan
        ? t('budgetBudgets.cover.loan')
        : t('budgetBudgets.cover.unbudgeted'));
    const row =
      line.budgetId === null ? undefined : byBudget.get(line.budgetId);
    const taken = line.covers
      .filter((c) => c.amount.amountMinor > 0)
      .map((c, index): CoverLine => ({
        key: `${line.entryId}-${String(index)}`,
        row,
        name,
        source: c.name,
        amount: money(-c.amount.amountMinor, c.amount.currency),
      }));
    return line.uncovered.amountMinor > 0
      ? [
          ...taken,
          {
            key: `${line.entryId}-uncovered`,
            row,
            name,
            source: null,
            amount: money(-line.uncovered.amountMinor, line.uncovered.currency),
          },
        ]
      : taken;
  });
  const next = data.coverOrder.slice(0, 3);
  return (
    <Tile
      title={t('budgetBudgets.cover.title')}
      icon={IconArrowUpDownLine}
      bodyClassName="px-0"
      actions={
        <Link
          to="/budget/$sub"
          params={{ sub: 'cover-order' }}
          className={bracketClass}
        >
          <Brackets>{t('budgetBudgets.cover.order')}</Brackets>
        </Link>
      }
    >
      {covers.isError ? (
        <div className="px-3">
          <TileFailed
            retry={() => {
              void covers.refetch();
            }}
          />
        </div>
      ) : lines.length === 0 ? (
        <p className="px-3 py-1.5 font-sans text-text-muted">
          {t('budgetBudgets.cover.none')}
        </p>
      ) : (
        lines.map((line) => (
          <Row
            key={line.key}
            columns={coverColumns}
            cells={[
              line.row?.icon == null ? null : (
                <CategoryIcon
                  key="i"
                  name={line.row.icon}
                  color={line.row.colour}
                />
              ),
              <span key="n" className="font-sans">
                {line.source === null ? (
                  t('budgetBudgets.cover.notCovered', { name: line.name })
                ) : (
                  <>
                    {t('budgetBudgets.cover.over', { name: line.name })}
                    <strong className="font-semibold">{line.source}</strong>
                  </>
                )}
              </span>,
              <Amount key="a" amount={line.amount} kind="expense" />,
            ]}
          />
        ))
      )}
      {next.length === 0 ? null : (
        <div className="px-3">
          <SectionTitle>{t('budgetBudgets.cover.nextTitle')}</SectionTitle>
        </div>
      )}
      {next.map((item, index) => {
        const budget = budgetById.get(item.id);
        const row = byBudget.get(item.id);
        const left = item.kind === 'free' ? data.free : budget?.left;
        const Icon = item.kind === 'free' ? IconWallet3Line : IconCoinsLine;
        return (
          <Row
            key={item.id}
            columns={nextColumns}
            className="border-b-0"
            cells={[
              <span key="n" className="text-text-muted">
                {t('budgetBudgets.cover.place', { n: index + 1 })}
              </span>,
              row?.icon == null ? (
                <Icon key="i" className="size-4 text-text-muted" />
              ) : (
                <CategoryIcon key="i" name={row.icon} />
              ),
              <span key="m" className="font-sans">
                {item.kind === 'free'
                  ? t('budgetBudgets.order.free')
                  : item.name}
              </span>,
              left === undefined ? null : (
                <Amount key="a" amount={left} className="text-text-muted" />
              ),
            ]}
          />
        );
      })}
    </Tile>
  );
}
