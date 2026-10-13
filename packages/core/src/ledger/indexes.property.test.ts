import { localDate, money, type LocalDate } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { budgetGroupsOn } from './balances.ts';
import { budgetSwitch, expense } from './build.ts';
import { activeSwitches, entriesInOrder, reversedIds } from './indexes.ts';
import { compareEntries } from './order.ts';
import { reverse } from './reverse.ts';
import { food, testChart } from './testing.ts';
import {
  transactionId,
  type BudgetGroup,
  type EntryMeta,
  type Transaction,
} from './types.ts';

// The memoised ledger-wide indexes equal the plain computation, however often
// and on whichever ledger they are asked. fast-check prints the seed of any
// failure.

const chart = testChart();
const userAccounts = [...chart.values()].filter((a) => a.systemRole === null);
const days = Array.from({ length: 10 }, (_, i) =>
  localDate(`2026-03-${String(i + 1).padStart(2, '0')}`),
);

type Op =
  | { t: 'expense'; account: number; amount: number }
  | { t: 'switch'; account: number; group: BudgetGroup }
  | { t: 'reverse'; pick: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    t: fc.constant('expense' as const),
    account: fc.nat(),
    amount: fc.integer({ min: 1, max: 1e6 }),
  }),
  fc.record({
    t: fc.constant('switch' as const),
    account: fc.nat(),
    group: fc.constantFrom('on' as const, 'off' as const),
  }),
  fc.record({ t: fc.constant('reverse' as const), pick: fc.nat() }),
);

function step(
  op: Op,
  ledger: readonly Transaction[],
  meta: EntryMeta,
): Transaction | null {
  const account =
    userAccounts[op.t === 'reverse' ? 0 : op.account % userAccounts.length];
  try {
    switch (op.t) {
      case 'expense':
        return account === undefined
          ? null
          : expense(chart, meta, {
              accountId: account.id,
              amount: money(op.amount, account.currency),
              categoryId: food,
            });
      case 'switch':
        return account === undefined
          ? null
          : budgetSwitch(chart, ledger, meta, {
              accountId: account.id,
              budgetGroup: op.group,
            });
      case 'reverse': {
        const target = ledger[op.pick % Math.max(1, ledger.length)];
        return target === undefined
          ? null
          : reverse(chart, ledger, target.id, meta);
      }
    }
  } catch {
    // Refusals (already undone, group unchanged, ...) just skip the step.
    return null;
  }
}

// Grows `ledger` in place, as a caller that keeps appending to one array
// does, handing back each state of it after every entry.
function grow(
  ledger: Transaction[],
  ops: readonly (readonly [Op, LocalDate])[],
  from = 0,
  visit: (ledger: readonly Transaction[]) => void = () => undefined,
) {
  ops.forEach(([op, occurredOn], i) => {
    const n = from + i;
    const next = step(op, ledger, {
      id: transactionId(`t${String(n).padStart(4, '0')}`),
      occurredOn,
      createdAt: `2026-04-01T00:00:${String(n % 60).padStart(2, '0')}.${String(n).padStart(3, '0')}Z`,
    });
    if (next !== null) ledger.push(next);
    visit(ledger);
  });
}

const opsArb = fc.array(fc.tuple(opArb, fc.constantFrom(...days)), {
  maxLength: 40,
});

// The plain computations the memoised ones stand for.
const plainReversed = (ledger: readonly Transaction[]) =>
  new Set(ledger.flatMap((t) => (t.reversesId === null ? [] : [t.reversesId])));
const plainOrder = (ledger: readonly Transaction[]) =>
  [...ledger].sort(compareEntries);
const plainSwitches = (ledger: readonly Transaction[]) => {
  const reversed = plainReversed(ledger);
  return ledger
    .filter((t) => t.budgetSwitch !== null && !reversed.has(t.id))
    .sort(compareEntries);
};
function plainGroups(ledger: readonly Transaction[], date?: LocalDate) {
  const groups = new Map<string, BudgetGroup>();
  for (const account of chart.values()) {
    if (account.budgetGroup !== null)
      groups.set(account.id, account.budgetGroup);
  }
  for (const { budgetSwitch: s, occurredOn } of plainSwitches(ledger)) {
    if (s !== null && (date === undefined || occurredOn <= date))
      groups.set(s.accountId, s.budgetGroup);
  }
  return groups;
}

function expectSame(ledger: readonly Transaction[]) {
  expect(reversedIds(ledger)).toEqual(plainReversed(ledger));
  expect(entriesInOrder(ledger)).toEqual(plainOrder(ledger));
  expect(activeSwitches(ledger)).toEqual(plainSwitches(ledger));
  for (const date of [undefined, ...days.filter((_, i) => i % 3 === 0)]) {
    expect(budgetGroupsOn(chart, ledger, date)).toEqual(
      plainGroups(ledger, date),
    );
  }
}

describe('ledger indexes', () => {
  it('equal the plain computation, asked repeatedly', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const ledger: Transaction[] = [];
        grow(ledger, ops);
        expectSame(ledger);
        expectSame(ledger);
        // Asking again returns the very same remembered result.
        expect(activeSwitches(ledger)).toBe(activeSwitches(ledger));
        expect(entriesInOrder(ledger)).toBe(entriesInOrder(ledger));
        expect(reversedIds(ledger)).toBe(reversedIds(ledger));
      }),
    );
  });

  it('stay right across different ledgers asked in turn', () => {
    fc.assert(
      fc.property(opsArb, opsArb, (first, second) => {
        const a: Transaction[] = [];
        const b: Transaction[] = [];
        grow(a, first);
        grow(b, second, 100);
        expectSame(a);
        expectSame(b);
        expectSame(a);
        // A copy has its own identity and the same answers.
        expect(activeSwitches([...a])).toEqual(activeSwitches(a));
      }),
    );
  });

  it('follow an array that keeps growing', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const ledger: Transaction[] = [];
        grow(ledger, ops, 0, expectSame);
      }),
    );
  });
});
