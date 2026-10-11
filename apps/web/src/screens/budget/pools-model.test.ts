import { money, type AccountView, type PoolView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { poolTiles } from './pools-model.ts';

const fig = (minor: number) => ({
  amount: money(minor, 'USD'),
  missingRates: [],
});

function pool(over: Partial<PoolView> & { id: string }): PoolView {
  return {
    name: over.id,
    kind: 'spending',
    countsTowardDaily: true,
    counts: true,
    defaultFor: null,
    archived: false,
    accountIds: [],
    balance: fig(0),
    cycle: null,
    colour: null,
    icon: null,
    ...over,
  };
}

function account(over: Partial<AccountView> & { id: string }): AccountView {
  return {
    name: over.id,
    kind: 'asset',
    currency: money(0, 'USD').currency,
    budgetGroup: 'on',
    poolId: 'a',
    balance: money(0, 'USD'),
    archived: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    lastReconciledOn: null,
    reconcileDue: false,
    colour: null,
    icon: null,
    creditLimit: null,
    creditAvailable: null,
    dueDay: null,
    minPayment: null,
    subtype: null,
    nextDueOn: null,
    ...over,
  };
}

describe('poolTiles', () => {
  it('skips archived pools and groups open accounts under their pool', () => {
    const tiles = poolTiles(
      [pool({ id: 'a' }), pool({ id: 'b' }), pool({ id: 'c', archived: true })],
      [
        account({ id: 'x', poolId: 'a' }),
        account({ id: 'y', poolId: 'b' }),
        account({ id: 'z', poolId: 'a', archived: true }),
      ],
    );
    expect(tiles.map((t) => t.id)).toEqual(['a', 'b']);
    expect(tiles[0]?.accounts.map((a) => a.id)).toEqual(['x']);
  });

  it('marks the Budget pool fixed and savings pools without a cycle', () => {
    const [budget, savings] = poolTiles(
      [
        pool({ id: 'a', defaultFor: 'on' }),
        pool({ id: 'b', kind: 'savings', countsTowardDaily: false }),
      ],
      [],
    );
    expect(budget?.fixed).toBe(true);
    expect(savings?.fixed).toBe(false);
    expect(savings?.checked).toBe(false);
    expect(savings?.cycle).toBeNull();
  });

  it('sizes the left bar from the cycle figures and fills it past the start', () => {
    const [half, over] = poolTiles(
      [
        pool({
          id: 'a',
          cycle: { start: fig(10000), left: fig(2500) },
        }),
        pool({
          id: 'b',
          cycle: { start: fig(10000), left: fig(12000) },
        }),
      ],
      [],
    );
    expect(half?.cycle?.fraction).toBe(0.25);
    expect(over?.cycle?.fraction).toBe(1);
  });

  it('uses the stored colour and icon and leaves the others where they were', () => {
    const [first, second, third] = poolTiles(
      [
        pool({ id: 'a' }),
        pool({ id: 'b', colour: 'series-7', icon: 'piggy-bank' }),
        pool({ id: 'c' }),
      ],
      [],
    );
    expect([first?.color, first?.icon]).toEqual(['series-1', null]);
    expect([second?.color, second?.icon]).toEqual(['series-7', 'piggy-bank']);
    expect([second?.storedColour, second?.storedIcon]).toEqual([
      'series-7',
      'piggy-bank',
    ]);
    expect([third?.color, third?.storedColour]).toEqual(['series-3', null]);
  });
});
