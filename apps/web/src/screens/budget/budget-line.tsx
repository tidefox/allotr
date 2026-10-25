import type { ReactNode } from 'react';
import { Amount } from '@/components/amount';
import { Bar, seriesBg, type SeriesColor } from '@/components/bars';
import { isNearLimit } from '@/components/bars-math';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon } from '@/components/states';
import { IconArrowDownSLine, IconArrowRightSLine } from '@/generated/icons';
import { cn } from '@/lib/utils';
import type { BudgetRow } from '@/screens/dashboard/tiles/budgets';

// One budget in the tree (the locked design's budget row), shared by the
// dashboard's budgets tile and the budgets sub-tab: fold handle or tree
// line, icon, name, bar with the even-pace tick, spent, left and, on the
// sub-tab, an action. Every figure is the server's.

/**
 * Lead, icon, name, bar, spent, left. Left is the figure to act on, so a
 * phone keeps it and drops spent; spent comes back from 600 px, in front of
 * left.
 */
export const budgetLineColumns: readonly RowColumn[] = [
  { width: '1.5rem' },
  { width: '1.125rem' },
  { width: 'minmax(5rem, 1.6fr)' },
  { width: 'minmax(2.25rem, 1.4fr)' },
  { width: '11ch', from: 'medium' },
  { width: '11ch' },
];

export function BudgetLine({
  row,
  pace,
  expanded,
  onToggle,
  foldLabel,
  setAsideLabel,
  barLabel,
  columns = budgetLineColumns,
  showSpent = true,
  showLead = true,
  action,
  className,
}: {
  row: BudgetRow;
  pace: number | undefined;
  expanded: boolean;
  onToggle: () => void;
  foldLabel: string;
  setAsideLabel: string;
  barLabel: string;
  columns?: readonly RowColumn[];
  /** False in a narrow tile, where spent has no room beside left. */
  showSpent?: boolean;
  /** False when no row folds or hangs off a parent: the icon then leads. */
  showLead?: boolean;
  /** A trailing cell, when the columns have room for one. */
  action?: ReactNode;
  className?: string | undefined;
}) {
  const parent = row.role === 'parent';
  const lead = parent ? (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={foldLabel}
      onClick={onToggle}
      className="press flex size-hit items-center justify-center text-text-muted"
    >
      {expanded ? (
        <IconArrowDownSLine className="size-4" />
      ) : (
        <IconArrowRightSLine className="size-4" />
      )}
    </button>
  ) : (
    <span aria-hidden="true" className="block w-6 text-center text-outline">
      {row.role === 'child' ? '├' : row.role === 'last-child' ? '└' : ''}
    </span>
  );
  const overLeft = row.left.amountMinor < 0;
  const cells: ReactNode[] = [
    lead,
    row.icon === null ? null : (
      <CategoryIcon key="i" name={row.icon} color={row.colour} />
    ),
    <span key="n" className="font-sans">
      <span data-name="">{row.name}</span>
      {row.setAside ? (
        <span className="font-normal text-text-muted"> {setAsideLabel}</span>
      ) : null}
    </span>,
    // Room for the pace tick, which reaches past the track; a row cell
    // clips what overflows it.
    <div key="b" className="py-[3px]">
      <Bar
        value={row.fraction}
        over={row.over}
        near={!row.over && isNearLimit(row.fraction)}
        pace={row.setAside ? undefined : pace}
        fillClassName={seriesBg[`series-${String(row.colour)}` as SeriesColor]}
        label={barLabel}
      />
    </div>,
    <span
      key="s"
      className={cn(
        'block text-right',
        row.over ? 'text-negative' : 'text-text-muted',
      )}
    >
      <Amount amount={row.spent} />
    </span>,
    // The figure to act on: heavier than spent.
    <span
      key="l"
      className={cn(
        'block text-right font-semibold',
        overLeft && 'text-negative',
      )}
    >
      <Amount amount={row.left} />
    </span>,
  ];
  if (action !== undefined) cells.push(action);
  // Lead is column 0 and spent column 4.
  const kept = <T,>(list: readonly T[]) =>
    list.filter((_, i) => (showLead || i !== 0) && (showSpent || i !== 4));
  return (
    <Row
      columns={kept(columns)}
      cells={kept(cells)}
      // A parent row is bold throughout, as the locked design's `.r.parent`.
      className={cn(parent && 'font-semibold', className)}
    />
  );
}
