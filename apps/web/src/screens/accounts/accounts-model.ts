import { type AccountView, type Money, type PoolView } from '@allotr/shared';

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
  accounts: readonly AccountView[];
}>;

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

/** Pools in the server's order, then credit, then accounts with no pool. */
export function accountGroups(
  accounts: readonly AccountView[],
  pools: readonly PoolView[],
  filter: AccountsFilter,
): AccountGroup[] {
  const shown = accounts.filter((a) => !a.archived && inFilter(a, filter));
  const credit = shown.filter(isCredit);
  const rest = shown.filter((a) => !isCredit(a));
  const groups: AccountGroup[] = [];
  const known = new Set<string>();
  for (const pool of pools) {
    if (pool.archived) continue;
    known.add(pool.id);
    const inPool = rest.filter((a) => a.poolId === pool.id);
    if (inPool.length > 0) {
      groups.push({
        id: pool.id,
        name: pool.name,
        kind: 'pool',
        balance: pool.balance.amount,
        accounts: inPool,
      });
    }
  }
  const strays = rest.filter((a) => !known.has(a.poolId));
  if (strays.length > 0) {
    groups.push({
      id: NO_POOL_GROUP,
      name: null,
      kind: 'none',
      balance: null,
      accounts: strays,
    });
  }
  if (credit.length > 0) {
    groups.push({
      id: CREDIT_GROUP,
      name: null,
      kind: 'credit',
      balance: null,
      accounts: credit,
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

/** The pools an account can move to: open, and not the one it is in. */
export function movePools(
  account: AccountView,
  pools: readonly PoolView[],
): PoolView[] {
  return pools.filter((p) => !p.archived && p.id !== account.poolId);
}
