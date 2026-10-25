import {
  type AccountView,
  type CategoryIcon,
  type Money,
  type PoolKind,
  type PoolView,
} from '@allotr/shared';
import type { SeriesColor } from '@/components/bars';
import { accountLook, poolLooks } from '@/lib/pool-style';
import { barFraction } from '@/shell/summary-math';

// View model for the Accounts screen. Every amount is a server figure; this
// file only sorts accounts into groups and counts them (docs/ui.md §4).

export type AccountsFilter = 'all' | 'on-budget' | 'off-budget' | 'credit';

/** A pool, or the credit group, with the accounts shown under it. */
export type AccountGroup = Readonly<{
  /** The pool's id; `credit` for the credit group; `none` for strays. */
  id: string;
  /** The pool's name; null for the credit and stray groups (the screen names them). */
  name: string | null;
  kind: 'pool' | 'credit' | 'none';
  /** What the pool's open accounts hold; null where there is no such figure. */
  balance: Money | null;
  /** Spending or savings; null for the credit and stray groups. */
  poolKind: PoolKind | null;
  /**
   * The pool's stored colour, else its series by its place among the open
   * pools (as in the top bar); `negative` for credit, null for strays.
   */
  color: SeriesColor | 'negative' | null;
  /** The pool's stored icon; null shows its kind's icon. */
  icon: CategoryIcon | null;
  /** Whether the pool counts toward the daily number today. */
  counts: boolean;
  /** Cycle money left ÷ start for a pool that counts; a bar width only. */
  cycleFraction: number | null;
  /** Credit group only: the server's limit total and what is free of it. */
  limit?: Money | null;
  available?: Money | null;
  accounts: readonly AccountView[];
}>;

/** The server's limit and free totals over the credit accounts with a limit. */
export type CreditTotals = Readonly<{ limit: Money; available: Money }>;

export const CREDIT_GROUP = 'credit';
export const NO_POOL_GROUP = 'none';

/** Credit cards and loans: the accounts that hold what you owe. */
export function isCredit(account: AccountView): boolean {
  return account.kind === 'liability';
}

/** Whether an account shows under a sub-tab. */
export function inFilter(
  account: AccountView,
  filter: AccountsFilter,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'credit':
      return isCredit(account);
    case 'on-budget':
      return !isCredit(account) && account.budgetGroup === 'on';
    case 'off-budget':
      return !isCredit(account) && account.budgetGroup === 'off';
  }
}

/**
 * Accounts by what they hold, the largest first; with `owed`, the one that
 * owes most first (a debt is a negative balance). Accounts have no stored
 * order, so this is what the list shows. Balances in different currencies
 * do not compare, so each currency keeps together, in the order it first
 * appears. Ties keep the server's order.
 */
export function sortByBalance(
  accounts: readonly AccountView[],
  owed = false,
): AccountView[] {
  const currencies: string[] = [];
  for (const a of accounts)
    if (!currencies.includes(a.balance.currency))
      currencies.push(a.balance.currency);
  const sign = owed ? 1 : -1;
  return accounts
    .map((account, index) => ({ account, index }))
    .sort(
      (a, b) =>
        currencies.indexOf(a.account.balance.currency) -
          currencies.indexOf(b.account.balance.currency) ||
        sign *
          (a.account.balance.amountMinor - b.account.balance.amountMinor) ||
        a.index - b.index,
    )
    .map(({ account }) => account);
}

/** Pools in the server's order, then credit, then accounts with no pool. */
export function accountGroups(
  accounts: readonly AccountView[],
  pools: readonly PoolView[],
  filter: AccountsFilter,
  /** The server's credit total (`totals.creditOwed`), for the credit group. */
  creditOwed: Money | null = null,
  /** The server's limit and free totals over the credit accounts with a limit. */
  creditTotals: CreditTotals | null = null,
): AccountGroup[] {
  const shown = accounts.filter((a) => !a.archived && inFilter(a, filter));
  const credit = shown.filter(isCredit);
  const rest = shown.filter((a) => !isCredit(a));
  const groups: AccountGroup[] = [];
  const known = new Set<string>();
  const looks = poolLooks(pools);
  const open = pools.filter((p) => !p.archived);
  open.forEach((pool) => {
    known.add(pool.id);
    const inPool = sortByBalance(rest.filter((a) => a.poolId === pool.id));
    if (inPool.length > 0) {
      groups.push({
        id: pool.id,
        name: pool.name,
        kind: 'pool',
        balance: pool.balance.amount,
        poolKind: pool.kind,
        color: looks.get(pool.id)?.colour ?? 'series-1',
        icon: looks.get(pool.id)?.icon ?? null,
        counts: pool.counts,
        cycleFraction:
          pool.cycle === null
            ? null
            : barFraction(
                pool.cycle.left.amount.amountMinor,
                pool.cycle.start.amount.amountMinor,
              ),
        accounts: inPool,
      });
    }
  });
  const strays = rest.filter((a) => !known.has(a.poolId));
  if (strays.length > 0) {
    groups.push({
      id: NO_POOL_GROUP,
      name: null,
      kind: 'none',
      balance: null,
      poolKind: null,
      color: null,
      icon: null,
      counts: false,
      cycleFraction: null,
      accounts: sortByBalance(strays),
    });
  }
  if (credit.length > 0) {
    groups.push({
      id: CREDIT_GROUP,
      name: null,
      kind: 'credit',
      balance: creditOwed,
      poolKind: null,
      color: 'negative',
      icon: null,
      counts: false,
      // Free ÷ limit over the cards that have a limit, both from the server.
      cycleFraction:
        creditTotals === null
          ? null
          : barFraction(
              creditTotals.available.amountMinor,
              creditTotals.limit.amountMinor,
            ),
      limit: creditTotals === null ? null : creditTotals.limit,
      available: creditTotals === null ? null : creditTotals.available,
      accounts: sortByBalance(credit, true),
    });
  }
  return groups;
}

/** Open accounts the server flags as due for a reconcile. */
export function needsReconcile(
  accounts: readonly AccountView[],
): AccountView[] {
  return accounts.filter((a) => !a.archived && a.reconcileDue);
}

/**
 * An account's colour: its stored one, else `negative` for credit, else its
 * pool's colour (as in the tree and top bar).
 */
export function accountColour(
  account: AccountView,
  pools: readonly PoolView[],
): SeriesColor | 'negative' | null {
  return accountLook(account, poolLooks(pools)).colour;
}

/**
 * How many open accounts and open pools the ledger has, for the list's
 * title bar (the same on every sub-tab, as in the mockup).
 */
export function ledgerCounts(
  accounts: readonly AccountView[],
  pools: readonly PoolView[],
): { accounts: number; pools: number } {
  return {
    accounts: accounts.filter((a) => !a.archived).length,
    pools: pools.filter((p) => !p.archived).length,
  };
}

/** The pools an account can move to: open, and not the one it is in. */
export function movePools(
  account: AccountView,
  pools: readonly PoolView[],
): PoolView[] {
  return pools.filter((p) => !p.archived && p.id !== account.poolId);
}
