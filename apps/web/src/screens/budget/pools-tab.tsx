import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type ComponentType } from 'react';
import { ToggleButton } from 'react-aria-components';
import type { AccountView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import {
  LeftBar,
  SkeletonTile,
  seriesBg,
  type SeriesColor,
} from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { EmptyState } from '@/components/states';
import { Sparkline } from '@/charts/sparkline';
import {
  IconAddLine,
  IconCheckboxBlankLine,
  IconCheckboxLine,
  IconFundsLine,
  IconSafe2Line,
  IconWallet3Line,
  type IconProps,
} from '@/generated/icons';
import { poolQueryKeys, poolsQuery, updatePool } from '@/lib/budgets';
import { formatMoney } from '@/lib/format-money';
import { glyph } from '@/lib/pool-style';
import { accountHistoryQuery, accountsQuery, todayQuery } from '@/lib/ledger';
import { sparkPoints } from '@/lib/spark-points';
import { t } from '@/messages/t';
import { AccountIcon } from '../accounts/account-list.tsx';
import { NewAccountSheet } from '../accounts/new-account-sheet.tsx';
import { Formula } from '../dashboard/tiles/this-cycle.tsx';
import { PoolSheet } from './pool-sheet.tsx';
import { PoolStyleSheet } from './pool-style-sheet.tsx';
import { poolTiles, type PoolTile } from './pools-model.ts';

const locale = 'en';
const money = (amount: Parameters<typeof formatMoney>[0]) =>
  formatMoney(amount, 'symbol', locale);

// Tree line, kind icon, name, sparkline, balance (the locked design's
// pool tile rows).
const columns: readonly RowColumn[] = [
  { width: '1.5rem' },
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: '4.375rem' },
  { width: 'auto' },
];

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

/** `☑ counts toward daily`: the pool's own switch, in the tile body. */
function DailyToggle({
  tile,
  onChange,
}: {
  tile: PoolTile;
  onChange: (checked: boolean) => void;
}) {
  return (
    <ToggleButton
      isSelected={tile.checked}
      isDisabled={tile.fixed}
      onChange={onChange}
      aria-label={t(
        tile.fixed ? 'budgetPools.dailyFixedLabel' : 'budgetPools.dailyLabel',
        { name: tile.name },
      )}
      className="press inline-flex min-h-hit shrink-0 items-center gap-1.5 whitespace-nowrap text-text-muted disabled:cursor-not-allowed"
    >
      {({ isSelected }) => (
        <>
          {isSelected ? (
            <IconCheckboxLine className="size-4 text-primary" />
          ) : (
            <IconCheckboxBlankLine className="size-4 text-primary" />
          )}
          {t('budgetPools.counts')}
        </>
      )}
    </ToggleButton>
  );
}

function Trend({
  account,
  color,
}: {
  account: AccountView;
  color: SeriesColor;
}) {
  const history = useQuery(accountHistoryQuery(account.id));
  const points =
    history.data === undefined ? [] : sparkPoints(history.data.points);
  return (
    <div className="min-h-[1.25rem]">
      {points.length < 2 ? null : (
        <Sparkline
          points={points}
          color={account.balance.amountMinor < 0 ? 'negative' : color}
          label={t('budgetPools.sparkline', { name: account.name })}
          // The mockup's 200 × 20 line, as wide as the column.
          className="aspect-[10/1] h-auto"
        />
      )}
    </div>
  );
}

const poolIcon: Record<PoolTile['kind'], ComponentType<IconProps>> = {
  spending: IconWallet3Line,
  savings: IconSafe2Line,
};

function PoolCard({
  tile,
  failed,
  onToggle,
  onAdd,
  onStyle,
  onRename,
}: {
  tile: PoolTile;
  failed: boolean;
  onToggle: (checked: boolean) => void;
  onAdd: () => void;
  onStyle: () => void;
  onRename: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Tile
      title={tile.name}
      icon={glyph(tile.icon, poolIcon[tile.kind])}
      subtitle={t(
        tile.checked ? 'budgetPools.onBudget' : 'budgetPools.offBudget',
      )}
      primary={tile.checked}
      actions={
        <>
          <BracketButton
            aria-label={t('budgetPools.renameOf', { name: tile.name })}
            onPress={onRename}
          >
            {t('budgetPools.renameAction')}
          </BracketButton>
          <BracketButton
            aria-label={t('budgetPools.styleOf', { name: tile.name })}
            onPress={onStyle}
          >
            {t('budgetPools.styleAction')}
          </BracketButton>
          <BracketButton
            icon={IconAddLine}
            aria-label={t('budgetPools.addAccountTo', { name: tile.name })}
            onPress={onAdd}
          >
            {t('budgetPools.addAccount')}
          </BracketButton>
        </>
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <DailyToggle tile={tile} onChange={onToggle} />
        <span className="text-big leading-[1.15] font-semibold tracking-[-0.01em]">
          <Amount amount={tile.balance} locale={locale} />
        </span>
      </div>
      {tile.cycle === null ? (
        <div className="h-2" />
      ) : (
        <div className="pt-0.5 pb-2">
          <LeftBar
            fraction={tile.cycle.fraction}
            height={4}
            fillClassName={seriesBg[tile.color]}
            label={t('budgetPools.leftLabel', { name: tile.name })}
            className="mt-1.5"
          />
          <p className="num truncate text-tiny text-text-muted">
            {t('budgetPools.left', {
              left: money(tile.cycle.left),
              start: money(tile.cycle.start),
            })}
          </p>
        </div>
      )}
      {failed ? (
        <p role="alert" className="mb-1 text-small text-negative">
          {t('budgetPools.saveFailed', { name: tile.name })}
        </p>
      ) : null}
      {tile.accounts.length === 0 ? (
        <p className="font-sans text-text-muted">
          {t('budgetPools.noAccounts')}
        </p>
      ) : (
        <ul className="-mx-3">
          {tile.accounts.map((account, index) => (
            <li key={account.id}>
              <Row
                columns={columns}
                onPress={() => {
                  void navigate({
                    to: '/accounts',
                    search: { account: account.id },
                  });
                }}
                cells={[
                  <span
                    key="l"
                    aria-hidden="true"
                    className="block w-6 text-center text-outline"
                  >
                    {index === tile.accounts.length - 1 ? '└' : '├'}
                  </span>,
                  <AccountIcon
                    key="i"
                    account={account}
                    className="size-4 text-text-muted"
                  />,
                  <span key="n" className="font-sans">
                    {account.name}
                  </span>,
                  <Trend key="t" account={account} color={tile.color} />,
                  <Amount
                    key="a"
                    amount={account.balance}
                    locale={locale}
                    className={
                      account.balance.amountMinor < 0
                        ? 'text-negative'
                        : 'text-text-muted'
                    }
                  />,
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

function HowItWorks() {
  const today = useQuery(todayQuery);
  const view = today.data;
  return (
    <Tile title={t('budgetPools.how.title')} icon={IconFundsLine} span="full">
      <p className="mb-1.5 font-sans text-text-muted">
        {t('budgetPools.how.body')}
      </p>
      {view === undefined ? null : (
        <Formula
          figures={view}
          daysLeft={view.daysLeft}
          className="mt-0 border-t-0 pt-0"
        />
      )}
    </Tile>
  );
}

// The locked design's `data-cols="2"`: one column on phones, two from 720.
const twoColumns = 'min-h-full cols3:grid-cols-2 cols4:grid-cols-2';

// Budget · pools (docs/ui.md §6): one tile per pool, then how the daily
// number works. Switching a pool changes what counts toward the daily
// number; the server refuses it for the Budget pool (409 pool_fixed).
export function PoolsTab() {
  const pools = useQuery(poolsQuery);
  const accounts = useQuery(accountsQuery);
  const toggle = useToggleDaily();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [styling, setStyling] = useState<PoolTile | null>(null);
  const [renaming, setRenaming] = useState<PoolTile | null>(null);
  const [creating, setCreating] = useState(false);

  if (pools.isError || accounts.isError) {
    return (
      <Tile title={t('nav.budget')}>
        <EmptyState
          title={t('budgetPools.failed')}
          hint=""
          action={
            <BracketButton
              onPress={() => {
                void pools.refetch();
                void accounts.refetch();
              }}
            >
              {t('budgetPools.retry')}
            </BracketButton>
          }
        />
      </Tile>
    );
  }
  if (pools.data === undefined || accounts.data === undefined) {
    return (
      <Grid className={twoColumns}>
        <SkeletonTile rows={4} />
        <SkeletonTile rows={4} />
      </Grid>
    );
  }
  const tiles = poolTiles(pools.data.pools, accounts.data.accounts);
  return (
    <>
      <Grid className={twoColumns}>
        {tiles.length === 0 ? (
          <Tile title={t('nav.budget')} span="full">
            <EmptyState
              title={t('budgetPools.empty')}
              hint={t('budgetPools.emptyHint')}
            />
          </Tile>
        ) : (
          tiles.map((tile) => (
            <PoolCard
              key={tile.id}
              tile={tile}
              failed={toggle.isError && toggle.variables.id === tile.id}
              onToggle={(checked) => {
                toggle.mutate({ id: tile.id, checked });
              }}
              onAdd={() => {
                setAdding(true);
              }}
              onStyle={() => {
                setStyling(tile);
              }}
              onRename={() => {
                setRenaming(tile);
              }}
            />
          ))
        )}
        <Tile
          title={t('budgetPools.newPool.title')}
          icon={IconAddLine}
          actions={
            <BracketButton
              icon={IconAddLine}
              onPress={() => {
                setCreating(true);
              }}
            >
              {t('budgetPools.newPool.action')}
            </BracketButton>
          }
        >
          <p className="font-sans text-text-muted">
            {t('budgetPools.newPool.body')}
          </p>
        </Tile>
        <HowItWorks />
      </Grid>
      {styling === null ? null : (
        <PoolStyleSheet
          pool={styling}
          onClose={() => {
            setStyling(null);
          }}
        />
      )}
      {renaming === null ? null : (
        <PoolSheet
          pool={renaming}
          onClose={() => {
            setRenaming(null);
          }}
        />
      )}
      {creating ? (
        <PoolSheet
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
      {adding ? (
        <NewAccountSheet
          onClose={() => {
            setAdding(false);
          }}
          onCreated={(account) => {
            setAdding(false);
            void navigate({ to: '/accounts', search: { account: account.id } });
          }}
        />
      ) : null}
    </>
  );
}
