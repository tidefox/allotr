import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Amount } from '@/components/amount';
import {
  Bar,
  SkeletonTile,
  seriesBg,
  type SeriesColor,
} from '@/components/bars';
import { Brackets, bracketClass } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon, EmptyState } from '@/components/states';
import { ChartLegend } from '@/charts/chart';
import {
  IconArrowDownSLine,
  IconArrowRightSLine,
  IconPieChart2Line,
} from '@/generated/icons';
import { budgetsQuery } from '@/lib/budgets';
import { categoriesQuery } from '@/lib/ledger';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import { budgetRows, periodPace, type BudgetRow } from './budgets.ts';

// Lead (fold handle or tree line), icon, name, bar, spent, left. Phones
// drop the left column.
const columns: readonly RowColumn[] = [
  { width: '1.5rem' },
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'minmax(2.25rem, 2.4fr)' },
  { width: '9ch' },
  { width: '9ch', from: 'medium' },
];

export function BudgetsTile() {
  const budgets = useQuery(budgetsQuery);
  const categories = useQuery(categoriesQuery);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const title = t('dashboardTiles.budgets.title');
  if (budgets.isError) {
    return (
      <Tile title={title}>
        <TileFailed
          retry={() => {
            void budgets.refetch();
          }}
        />
      </Tile>
    );
  }
  if (budgets.data === undefined) return <SkeletonTile rows={4} />;
  const rows = budgetRows(budgets.data, categories.data?.categories ?? []);
  const shown = rows.filter(
    (row) =>
      (row.role !== 'child' && row.role !== 'last-child') ||
      !folded.has(row.group),
  );
  const pace = periodPace(budgets.data);
  const toggle = (group: string) => {
    setFolded((before) => {
      const next = new Set(before);
      if (!next.delete(group)) next.add(group);
      return next;
    });
  };
  return (
    <Tile
      title={title}
      icon={IconPieChart2Line}
      subtitle={t('dashboardTiles.budgets.subtitle')}
      actions={
        <Link
          to="/budget/$sub"
          params={{ sub: 'budgets' }}
          className={bracketClass}
        >
          <Brackets>{t('dashboardTiles.budgets.all')}</Brackets>
        </Link>
      }
      bodyClassName="px-0"
    >
      {rows.length === 0 ? (
        <EmptyState
          title={t('dashboardTiles.budgets.emptyTitle')}
          hint={t('dashboardTiles.budgets.emptyHint')}
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
            />
          ))}
          {pace === null ? null : (
            <ChartLegend
              className="px-3"
              items={[
                {
                  label: t('dashboardTiles.budgets.pace', {
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

function BudgetLine({
  row,
  pace,
  expanded,
  onToggle,
}: {
  row: BudgetRow;
  pace: number | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const parent = row.role === 'parent';
  const lead = parent ? (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={t(
        expanded
          ? 'dashboardTiles.budgets.collapse'
          : 'dashboardTiles.budgets.expand',
        { name: row.name },
      )}
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
  return (
    <Row
      columns={columns}
      className="border-b-0"
      cells={[
        lead,
        row.icon === null ? null : (
          <CategoryIcon key="i" name={row.icon} color={row.colour} />
        ),
        <span key="n" className={cn('font-sans', parent && 'font-semibold')}>
          {row.name}
          {row.setAside ? (
            <span className="font-normal text-text-muted">
              {' '}
              {t('dashboardTiles.budgets.setAside')}
            </span>
          ) : null}
        </span>,
        <Bar
          key="b"
          value={row.fraction}
          over={row.over}
          pace={row.setAside ? undefined : pace}
          fillClassName={
            seriesBg[`series-${String(row.colour)}` as SeriesColor]
          }
          label={t('dashboardTiles.budgets.barLabel', { name: row.name })}
        />,
        <span
          key="s"
          className={cn(
            'block text-right',
            row.over ? 'text-negative' : 'text-text-muted',
          )}
        >
          <Amount amount={row.spent} />
        </span>,
        <span
          key="l"
          className={cn(
            'block text-right font-semibold',
            overLeft && 'text-negative',
          )}
        >
          <Amount amount={row.left} />
        </span>,
      ]}
    />
  );
}
