import { daysBetween } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { AccountView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Split, Tile } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { Stats, type Stat } from '@/components/stats';
import { EmptyState } from '@/components/states';
import { useFrameWidth } from '@/components/use-frame-width';
import { worthDays } from '@/features/net-worth/model';
import { formatTerminalDate } from '@/features/today/format';
import {
  IconAddLine,
  IconBankCardLine,
  IconBankLine,
  IconCheckLine,
  IconLineChartLine,
  IconSafe2Line,
} from '@/generated/icons';
import { poolsQuery } from '@/lib/budgets';
import { accountsQuery, todayQuery } from '@/lib/ledger';
import { netWorthQuery } from '@/lib/plan';
import { t } from '@/messages/t';
import { openNewForm } from '@/shell/command/store';
import {
  accountGroups,
  isCredit,
  needsReconcile,
  ledgerCounts,
  type AccountsFilter,
} from './accounts-model.ts';
import { AccountList, type RowAction } from './account-list.tsx';
import { AccountDetail } from './detail/account-detail.tsx';
import { ArchiveSheet } from './detail/archive-sheet.tsx';
import { ReconcileSheet } from './detail/reconcile-sheet.tsx';
import { MoveSheet } from './move-sheet.tsx';
import { NewAccountSheet } from './new-account-sheet.tsx';
import { RenameSheet } from './rename-sheet.tsx';
import { validateAccountsSearch } from './search-params.ts';

const locale = 'en';

type Open = Readonly<{
  action: 'reconcile' | 'rename' | 'move' | 'archive';
  account: AccountView;
}>;

function filterOf(sub: string | undefined): AccountsFilter {
  return sub === 'on-budget' || sub === 'off-budget' || sub === 'credit'
    ? sub
    : 'all';
}

// Accounts (docs/ui.md §6): stats on top, then the pool and account tree
// with the open account beside it (from 1000 px) or in a sheet. Every
// figure comes from the server; the tree only groups accounts. The open
// account lives in the URL.
export function AccountsScreen() {
  const navigate = useNavigate();
  const { sub } = useParams({ strict: false });
  const raw = useSearch({ strict: false });
  const selected = validateAccountsSearch(raw).account;
  const wide = useFrameWidth() >= 1000;
  const filter = filterOf(sub);

  const accounts = useQuery(accountsQuery);
  const pools = useQuery(poolsQuery);
  // Net worth over the open cycle, so the server's `change` is this
  // cycle's (the API's shortest window is a week), as on the dashboard.
  const today = useQuery(todayQuery);
  const days =
    today.data === undefined
      ? 30
      : worthDays(today.data.cycle.openedOn, today.data.today);
  const wholeCycle =
    today.data !== undefined &&
    daysBetween(today.data.cycle.openedOn, today.data.today) + 1 === days;
  const worth = useQuery({
    ...netWorthQuery(days),
    enabled: today.data !== undefined,
  });
  const [open, setOpen] = useState<Open | null>(null);
  const [adding, setAdding] = useState(false);

  const select = (account: string | undefined) => {
    const search = account === undefined ? {} : { account };
    void navigate(
      filter === 'all'
        ? { to: '/accounts', search }
        : { to: '/accounts/$sub', params: { sub: filter }, search },
    );
  };

  const list = accounts.data?.accounts;
  const creditOwed = accounts.data?.totals.creditOwed.amount ?? null;
  const groups = useMemo(
    () =>
      list === undefined || pools.data === undefined
        ? undefined
        : accountGroups(list, pools.data.pools, filter, creditOwed),
    [list, pools.data, filter, creditOwed],
  );

  const stats = useMemo<Stat[] | undefined>(() => {
    if (accounts.data === undefined) return undefined;
    const open = accounts.data.accounts.filter((a) => !a.archived);
    const owed = accounts.data.totals.creditOwed;
    const credit = open.filter(isCredit).length;
    const saving = open.filter(
      (a) => !isCredit(a) && a.budgetGroup === 'off',
    ).length;
    const looks = needsReconcile(accounts.data.accounts);
    const firstLook = looks[0];
    const lookName =
      firstLook === undefined
        ? ''
        : looks.length > 1
          ? t('accountsScreen.stats.reconcileMore', {
              first: firstLook.name,
              count: looks.length - 1,
            })
          : firstLook.name;
    return [
      {
        label: t('accountsScreen.stats.netWorth'),
        icon: IconLineChartLine,
        figure:
          worth.data === undefined ? (
            '…'
          ) : (
            <Amount amount={worth.data.amount} locale={locale} />
          ),
        sub:
          worth.data === undefined ? undefined : (
            <>
              <Amount
                amount={worth.data.change}
                kind="change"
                locale={locale}
                // The stat's sub-line is muted throughout, arrow included.
                className="text-text-muted"
              />{' '}
              {t(
                wholeCycle
                  ? 'accountsScreen.stats.netWorthCycle'
                  : 'accountsScreen.stats.netWorthWeek',
              )}
            </>
          ),
        tone: 'primary',
      },
      {
        label: t('accountsScreen.stats.savings'),
        icon: IconSafe2Line,
        figure: (
          <Amount amount={accounts.data.totals.off.amount} locale={locale} />
        ),
        sub: t('accountsScreen.stats.savingsSub', { count: saving }),
      },
      {
        label: t('accountsScreen.stats.credit'),
        icon: IconBankCardLine,
        // Signed as the server sends it: negative while money is owed.
        figure:
          owed.amount.amountMinor === 0 ? (
            t('accountsScreen.stats.creditNone')
          ) : (
            <Amount amount={owed.amount} locale={locale} />
          ),
        ...(owed.amount.amountMinor < 0
          ? { figureTone: 'negative' as const }
          : {}),
        sub:
          owed.missingRates.length > 0
            ? t('accountsScreen.stats.creditMissing', {
                currencies: owed.missingRates.join(', '),
              })
            : credit === 0
              ? t('accountsScreen.stats.creditNoneSub')
              : t('accountsScreen.stats.creditSub', { count: credit }),
      },
      {
        label: t('accountsScreen.stats.reconcile'),
        icon: IconCheckLine,
        figure: (
          <>
            {looks.length}{' '}
            <span className="text-[0.6em] font-normal text-text-muted">
              {looks.length === 0
                ? t('accountsScreen.stats.reconcileNone')
                : t('accountsScreen.stats.reconcileLooks', {
                    count: looks.length,
                  })}
            </span>
          </>
        ),
        sub:
          firstLook === undefined
            ? t('accountsScreen.stats.reconcileNoneSub')
            : firstLook.lastReconciledOn === null
              ? t('accountsScreen.stats.reconcileNever', { name: lookName })
              : t('accountsScreen.stats.reconcileSince', {
                  name: lookName,
                  date: formatTerminalDate(firstLook.lastReconciledOn, locale),
                }),
      },
    ];
  }, [accounts.data, worth.data, wholeCycle]);

  const act = (action: RowAction, account: AccountView) => {
    if (action === 'transfer')
      openNewForm('transfer', { fromAccountId: account.id });
    else setOpen({ action, account });
  };
  const closeSheet = () => {
    setOpen(null);
  };

  const failed = accounts.isError || pools.isError;
  let body;
  if (failed) {
    body = (
      <div
        role="alert"
        className="flex items-center gap-2 px-3 py-2 text-small"
      >
        <span className="text-negative">{t('accountsScreen.failed')}</span>
        <BracketButton
          onPress={() => {
            void accounts.refetch();
            void pools.refetch();
          }}
        >
          {t('accountsScreen.retry')}
        </BracketButton>
      </div>
    );
  } else if (groups === undefined) {
    body = <SkeletonTile />;
  } else if (groups.length === 0) {
    body = (
      <EmptyState
        title={t('accountsScreen.list.empty')}
        hint={t('accountsScreen.list.emptyHint')}
      />
    );
  } else {
    body = (
      <AccountList
        groups={groups}
        selectedId={selected}
        onSelect={select}
        onAction={act}
        onAdd={() => {
          setAdding(true);
        }}
      />
    );
  }

  const detail = (bare: boolean) =>
    selected === undefined ? null : (
      <AccountDetail accountId={selected} bare={bare} onAction={act} />
    );
  const counts =
    list === undefined || pools.data === undefined
      ? undefined
      : ledgerCounts(list, pools.data.pools);
  const selectedName = list?.find((a) => a.id === selected)?.name;

  return (
    <>
      <div className="flex min-h-full flex-col [&>:last-child]:flex-1">
        {stats === undefined ? null : <Stats stats={stats} />}
        <Split
          list={
            <Tile
              title={t('accountsScreen.list.title')}
              icon={IconBankLine}
              subtitle={
                counts === undefined
                  ? undefined
                  : `${t('accountsScreen.list.accounts', { count: counts.accounts })} ${t('accountsScreen.list.inPools', { count: counts.pools })}`
              }
              actions={
                <BracketButton
                  icon={IconAddLine}
                  aria-label={t('accountsScreen.add.name')}
                  onPress={() => {
                    setAdding(true);
                  }}
                >
                  {t('accountsScreen.add.action')}
                </BracketButton>
              }
              className="min-h-full"
              bodyClassName="px-0 pb-0"
            >
              {body}
            </Tile>
          }
          detail={
            wide
              ? (detail(false) ?? (
                  <Tile
                    title={t('accountsScreen.detail.title')}
                    icon={IconBankLine}
                    className="h-full"
                  >
                    <EmptyState
                      title={t('accountsScreen.detail.pick')}
                      hint={t('accountsScreen.detail.pickHint')}
                    />
                  </Tile>
                ))
              : null
          }
        />
      </div>
      {wide ? null : (
        <Sheet
          isOpen={selected !== undefined}
          onOpenChange={(isOpen) => {
            if (!isOpen) select(undefined);
          }}
          title={selectedName ?? t('accountsScreen.detail.title')}
          closeLabel={t('accountsScreen.detail.close')}
        >
          {detail(true)}
        </Sheet>
      )}
      {adding ? (
        <NewAccountSheet
          onClose={() => {
            setAdding(false);
          }}
          onCreated={(account) => {
            setAdding(false);
            select(account.id);
          }}
        />
      ) : null}
      {open?.action === 'rename' ? (
        <RenameSheet account={open.account} onClose={closeSheet} />
      ) : null}
      {open?.action === 'move' && pools.data !== undefined ? (
        <MoveSheet
          account={open.account}
          pools={pools.data.pools}
          onClose={closeSheet}
        />
      ) : null}
      {open?.action === 'reconcile' ? (
        <ReconcileSheet account={open.account} open onClose={closeSheet} />
      ) : null}
      {open?.action === 'archive' ? (
        <ArchiveSheet account={open.account} open onClose={closeSheet} />
      ) : null}
    </>
  );
}
