import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PoolKind } from '@allotr/shared';
import { Link } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import { ToggleButton } from 'react-aria-components';
import { Amount } from '@/components/amount';
import { ShareBar, SkeletonTile, seriesText } from '@/components/bars';
import { Brackets, bracketClass } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { EmptyState } from '@/components/states';
import {
  IconCheckboxBlankLine,
  IconCheckboxLine,
  IconSafe2Line,
  IconStackLine,
  IconWallet3Line,
  type IconProps,
} from '@/generated/icons';
import { poolQueryKeys, poolsQuery, updatePool } from '@/lib/budgets';
import { formatMoney } from '@/lib/format-money';
import { todayQuery } from '@/lib/ledger';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { poolRows, type PoolRow } from './pools-model.ts';
import { TileFailed } from './tile-failed.tsx';

const locale = 'en';

function useToggleDaily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      updatePool(id, { countsTowardDaily: checked }),
    onSettled: async () => {
      await Promise.all(
        poolQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

const columns: readonly RowColumn[] = [
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
  { width: '11ch' },
];

const poolIcon: Record<PoolKind, ComponentType<IconProps>> = {
  spending: IconWallet3Line,
  savings: IconSafe2Line,
};

function PoolLine({
  row,
  onToggle,
  failed,
}: {
  row: PoolRow;
  onToggle: (checked: boolean) => void;
  failed: boolean;
}) {
  const Icon = poolIcon[row.kind];
  return (
    <>
      <Row
        columns={columns}
        cells={[
          <Icon key="i" className={cn('size-4', seriesText[row.color])} />,
          <span
            key="n"
            className={cn('font-sans', row.checked && 'font-semibold')}
          >
            {row.name}
          </span>,
          <ToggleButton
            key="c"
            isSelected={row.checked}
            isDisabled={row.fixed}
            onChange={onToggle}
            aria-label={t(
              row.fixed
                ? 'dashboardTiles.pools.countsFixed'
                : 'dashboardTiles.pools.counts',
              { name: row.name },
            )}
            className="press inline-flex min-h-hit items-center gap-1.5 text-text-muted disabled:cursor-not-allowed"
          >
            {({ isSelected }) => (
              <>
                {isSelected ? (
                  <IconCheckboxLine className="size-4 text-primary" />
                ) : (
                  <IconCheckboxBlankLine className="size-4 text-primary" />
                )}
                <span aria-hidden="true">
                  {t('dashboardTiles.pools.daily')}
                </span>
              </>
            )}
          </ToggleButton>,
          <span
            key="b"
            className={cn('block text-right', row.checked && 'font-semibold')}
          >
            <Amount amount={row.balance} locale={locale} />
          </span>,
        ]}
      />
      {failed ? (
        <p role="alert" className="px-3 text-small text-negative">
          {t('dashboardTiles.pools.saveFailed', { name: row.name })}
        </p>
      ) : null}
    </>
  );
}

export function PoolsTile() {
  const pools = useQuery(poolsQuery);
  const today = useQuery(todayQuery);
  const toggle = useToggleDaily();
  const rows = pools.data === undefined ? [] : poolRows(pools.data.pools);

  return (
    <Tile
      title={t('dashboardTiles.pools.title')}
      icon={IconStackLine}
      subtitle={
        today.data === undefined
          ? undefined
          : t('dashboardTiles.pools.subtitle', {
              amount: formatMoney(today.data.onBudget, 'symbol', locale),
            })
      }
      actions={
        <Link
          to="/budget/$sub"
          params={{ sub: 'pools' }}
          className={bracketClass}
        >
          <Brackets>{t('dashboardTiles.pools.manage')}</Brackets>
        </Link>
      }
      bodyClassName="px-0"
    >
      {pools.isError ? (
        <TileFailed
          retry={() => {
            void pools.refetch();
          }}
        />
      ) : pools.data === undefined ? (
        <SkeletonTile />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('dashboardTiles.pools.empty')}
          hint={t('dashboardTiles.pools.emptyHint')}
        />
      ) : (
        <>
          {rows.map((row) => (
            <PoolLine
              key={row.id}
              row={row}
              failed={toggle.isError && toggle.variables.id === row.id}
              onToggle={(checked) => {
                toggle.mutate({ id: row.id, checked });
              }}
            />
          ))}
          <div className="px-3">
            <ShareBar
              label={t('dashboardTiles.pools.share')}
              segments={rows.map((r) => ({
                id: r.id,
                label: r.name,
                fraction: r.shareBp / 10_000,
                shareBp: r.shareBp,
                color: r.color,
              }))}
              className="mt-2.5 h-3.5"
            />
          </div>
        </>
      )}
    </Tile>
  );
}
