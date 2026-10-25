import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { SkeletonTile } from '@/components/bars';
import { Brackets, bracketClass } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { useFrameWidth } from '@/components/use-frame-width';
import { ChartLegend } from '@/charts/chart';
import { IconPieChart2Line } from '@/generated/icons';
import { budgetsQuery } from '@/lib/budgets';
import { categoriesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { BudgetLine } from '@/screens/budget/budget-line';
import { TileFailed } from './tile-failed.tsx';
import { budgetRows, periodPace } from './budgets.ts';

export function BudgetsTile() {
  const budgets = useQuery(budgetsQuery);
  const categories = useQuery(categoriesQuery);
  // A phone shows left only, so the subtitle names only that column.
  const compact = useFrameWidth() < 600;
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
      subtitle={t(
        compact
          ? 'dashboardTiles.budgets.subtitleCompact'
          : 'dashboardTiles.budgets.subtitle',
      )}
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
              foldLabel={t(
                folded.has(row.group)
                  ? 'dashboardTiles.budgets.expand'
                  : 'dashboardTiles.budgets.collapse',
                { name: row.name },
              )}
              setAsideLabel={t('dashboardTiles.budgets.setAside')}
              barLabel={t('dashboardTiles.budgets.barLabel', {
                name: row.name,
              })}
              className="border-b-0"
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
