import { money, type AccountView, type PoolView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  accountColour,
  accountGroups,
  inFilter,
  ledgerCounts,
  movePools,
  needsReconcile,
} from './accounts-model.ts';

function account(patch: Partial<AccountView> & { id: string }): AccountView {
  return {
    name: patch.id,
    kind: 'asset',
    currency: money(0, 'USD').currency,
    budgetGroup: 'on',
    poolId: 'p-budget',
    balance: money(10000, 'USD'),
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastReconciledOn: null,
    reconcileDue: false,
    ...patch,
  };
}

function pool(patch: Partial<PoolView> & { id: string }): PoolView {
  return {
    name: patch.id,
    kind: 'spending',
    countsTowardDaily: true,
    counts: true,
    defaultFor: null,
    archived: false,
    accountIds: [],
    balance: { amount: money(50000, 'USD'), missingRates: [] },
    cycle: null,
    ...patch,
  };
}

const pools = [
  pool({ id: 'p-budget', name: 'Budget' }),
  pool({ id: 'p-save', name: 'Savings', kind: 'savings', counts: false }),
];
const cash = account({ id: 'cash' });
const bank = account({ id: 'bank' });
const nest = account({
  id: 'nest',
  budgetGroup: 'off',
  poolId: 'p-save',
});
const card = account({
  id: 'card',
  kind: 'liability',
  balance: money(-4500, 'USD'),
});
const old = account({ id: 'old', archived: true });

describe('inFilter', () => {
  it('keeps credit out of the on and off budget tabs', () => {
    expect(inFilter(card, 'on-budget')).toBe(false);
    expect(inFilter(card, 'off-budget')).toBe(false);
    expect(inFilter(card, 'credit')).toBe(true);
    expect(inFilter(cash, 'credit')).toBe(false);
  });

  it('splits the rest by budget group', () => {
    expect(inFilter(cash, 'on-budget')).toBe(true);
    expect(inFilter(nest, 'on-budget')).toBe(false);
    expect(inFilter(nest, 'off-budget')).toBe(true);
    expect(inFilter(nest, 'all')).toBe(true);
  });
});

describe('accountGroups', () => {
  const all = [cash, bank, nest, card, old];

  it('lists pools in order, then credit, and drops archived accounts', () => {
    const groups = accountGroups(all, pools, 'all');
    expect(groups.map((g) => g.id)).toEqual(['p-budget', 'p-save', 'credit']);
    expect(groups[0]?.accounts.map((a) => a.id)).toEqual(['cash', 'bank']);
    expect(groups[0]?.balance).toEqual(money(50000, 'USD'));
    expect(groups[2]?.balance).toBeNull();
  });

  it('shows only the pools with accounts in the tab', () => {
    expect(accountGroups(all, pools, 'off-budget').map((g) => g.id)).toEqual([
      'p-save',
    ]);
    expect(accountGroups(all, pools, 'credit').map((g) => g.id)).toEqual([
      'credit',
    ]);
  });

  it('gives the credit group the server credit total when there is one', () => {
    const owed = money(-4500, 'USD');
    const groups = accountGroups(all, pools, 'credit', owed);
    expect(groups[0]?.balance).toEqual(owed);
    expect(groups[0]?.color).toBe('negative');
  });

  it('colours pools by their place among open pools on every tab', () => {
    const hidden = pool({ id: 'p-old', archived: true });
    const list = [hidden, ...pools];
    const off = accountGroups(all, list, 'off-budget');
    expect(off[0]?.color).toBe('series-2');
    expect(accountGroups(all, list, 'all')[0]?.color).toBe('series-1');
  });

  it('marks counting pools and sizes their cycle bar from server figures', () => {
    const cycled = pool({
      id: 'p-budget',
      cycle: {
        start: { amount: money(40000, 'USD'), missingRates: [] },
        left: { amount: money(10000, 'USD'), missingRates: [] },
      },
    });
    const [budget, savings] = accountGroups(
      all,
      [cycled, ...pools.slice(1)],
      'all',
    );
    expect(budget?.counts).toBe(true);
    expect(budget?.cycleFraction).toBe(0.25);
    expect(savings?.counts).toBe(false);
    expect(savings?.cycleFraction).toBeNull();
  });

  it('keeps an account whose pool is unknown in its own group', () => {
    const stray = account({ id: 'stray', poolId: '' });
    const groups = accountGroups([stray], pools, 'all');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe('none');
  });
});

describe('accountColour', () => {
  it('uses the pool colour, or negative for credit', () => {
    expect(accountColour(nest, pools)).toBe('series-2');
    expect(accountColour(card, pools)).toBe('negative');
    expect(accountColour(account({ id: 'x', poolId: 'nope' }), pools)).toBe(
      null,
    );
  });
});

describe('ledgerCounts', () => {
  it('counts open accounts and open pools', () => {
    const hidden = pool({ id: 'p-old', archived: true });
    expect(ledgerCounts([cash, nest, old], [...pools, hidden])).toEqual({
      accounts: 2,
      pools: 2,
    });
  });
});

describe('needsReconcile', () => {
  it('lists the open accounts the server flags', () => {
    const due = account({ id: 'due', reconcileDue: true });
    const fresh = account({ id: 'fresh' });
    const gone = account({ id: 'gone', archived: true, reconcileDue: true });
    expect(needsReconcile([due, fresh, gone]).map((a) => a.id)).toEqual([
      'due',
    ]);
  });
});

describe('movePools', () => {
  it('offers open pools other than the current one', () => {
    const hidden = pool({ id: 'p-old', archived: true });
    expect(movePools(cash, [...pools, hidden]).map((p) => p.id)).toEqual([
      'p-save',
    ]);
  });
});
