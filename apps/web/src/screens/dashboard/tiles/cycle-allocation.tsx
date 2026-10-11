import { useQuery } from '@tanstack/react-query';
import { Allocation } from '@/charts/allocation';
import { SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { formatMoney } from '@/lib/format-money';
import { todayQuery } from '@/lib/ledger';
import { openBudgetSheet } from '@/screens/budget/sheets/store';
import { IconStackLine } from '@/generated/icons';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import { allocationSegments } from './cycle-allocation.ts';

export function CycleAllocationTile() {
  const today = useQuery(todayQuery);
  const data = today.data;
  const title = t('dashboardTiles.allocation.title');
  if (today.isError) {
    return (
      <Tile title={title} span={3}>
        <TileFailed
          retry={() => {
            void today.refetch();
          }}
        />
      </Tile>
    );
  }
  if (data === undefined) return <SkeletonTile span={3} />;
  const { allocation } = data;
  return (
    <Tile
      title={title}
      icon={IconStackLine}
      subtitle={t('dashboardTiles.allocation.subtitle', {
        start: formatMoney(allocation.start, 'symbol', 'en'),
      })}
      actions={
        <BracketButton
          onPress={() => {
            openBudgetSheet('payday');
          }}
        >
          {t('dashboardTiles.allocation.planPayday')}
        </BracketButton>
      }
      span={3}
    >
      {allocation.start.amountMinor <= 0 ? (
        <EmptyState
          title={t('dashboardTiles.allocation.emptyTitle')}
          hint={t('dashboardTiles.allocation.emptyHint')}
        />
      ) : (
        <Allocation
          segments={allocationSegments(allocation, {
            paidBills: t('dashboardTiles.allocation.paidBills'),
            savings: t('dashboardTiles.allocation.savings'),
            spent: t('dashboardTiles.allocation.spent'),
            other: t('dashboardTiles.allocation.other'),
            reserved: t('dashboardTiles.allocation.reserved'),
            free: t('dashboardTiles.allocation.free'),
          })}
          left={{ amount: data.onBudget, of: allocation.start }}
          label={title}
          leftLabel={t('dashboardTiles.allocation.left')}
          ofLabel={t('dashboardTiles.allocation.of')}
        />
      )}
    </Tile>
  );
}
