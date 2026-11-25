import { addDays, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expense, income } from '../ledger/build.ts';
import { food, meta, salary } from '../ledger/testing.ts';
import { reverse } from '../ledger/reverse.ts';
import type { Transaction } from '../ledger/types.ts';
import { cycleSpan, cyclesOf } from './cycles.ts';
import { dailyFiguresOn } from './daily.ts';
import { cycleDays } from './series.ts';
import { cycleSnapshot } from './snapshot.ts';
import { budgetId, type Budget } from './budgets.ts';
import { budgetStatus } from './budget-status.ts';
import { card, chart, day, openingUsd, view } from './testing.ts';

// ADR 0039: a paycheck cuts its day. Entries ordered before it belong to the
// cycle it closes. Day 0 below is payday, in order: breakfast $12, top-up
// $30, paycheck +$2,000, dinner $25.

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const at = (n: number) => `2026-04-01T08:00:${String(n).padStart(2, '0')}Z`;

function spent(on: string, amountMinor: number, n: number): Transaction {
  return expense(chart, meta(on, { createdAt: at(n) }), {
    accountId: card,
    amount: usd(amountMinor),
    categoryId: food,
  });
}

function paid(on: string, amountMinor: number, n: number): Transaction {
  return income(chart, meta(on, { createdAt: at(n) }), {
    accountId: card,
    amount: usd(amountMinor),
    categoryId: salary,
  });
}

const breakfast = spent('2026-04-01', 1200, 1);
const topUp = spent('2026-04-01', 3000, 2);
const pay = paid('2026-04-01', 200000, 3);
const dinner = spent('2026-04-01', 2500, 4);
const ledger = [openingUsd('2026-02-20', 50000), breakfast, topUp, pay, dinner];
const today = day('2026-04-03');

function figures(entries: readonly Transaction[] = ledger, on = today) {
  const v = view(entries);
  const cycles = cyclesOf(v, on);
  const [closed, open] = cycles;
  if (closed === undefined || open === undefined) throw new Error('cycles');
  return {
    v,
    cycles,
    closed: cycleSnapshot(v, closed, on, cycles),
    open: cycleSnapshot(v, open, on, cycles),
  };
}

describe('a paycheck cuts its day', () => {
  it('gives the closing cycle what came before the paycheck', () => {
    const { closed, open } = figures();
    expect(closed.lastDay).toBe('2026-04-01');
    expect(closed.spending).toEqual([{ categoryId: food, amount: usd(4200) }]);
    expect(open.spending).toEqual([{ categoryId: food, amount: usd(2500) }]);
    expect(closed.closing.on.get(usd(0).currency)).toEqual(usd(45800));
    expect(open.opening.on.get(usd(0).currency)).toEqual(usd(45800));
  });

  it('leaves the closing cycle without the paycheck in its leftover', () => {
    expect(figures().closed.leftover[0]?.leftover).toEqual(usd(45800));
  });

  it("counts only entries from the paycheck on in payday's figures", () => {
    const f = dailyFiguresOn(view(ledger), day('2026-04-01'));
    expect(f.spentToday).toEqual(usd(2500));
    expect(f.cycleSpent).toEqual(usd(2500));
    // Free money just before the paycheck, plus the paycheck.
    expect(f.startOfDay).toEqual(usd(45800 + 200000));
  });

  it('shows payday in both cycles with its own part', () => {
    const { v, cycles } = figures();
    const [closed, open] = cycles;
    if (closed === undefined || open === undefined) throw new Error('cycles');
    const last = cycleDays(v, closed, today).days.at(-1);
    expect(last).toMatchObject({ date: '2026-04-01', spent: usd(4200) });
    expect(cycleDays(v, open, today).days[0]).toMatchObject({
      date: '2026-04-01',
      spent: usd(2500),
    });
  });

  it('keeps an undo with the entry it undoes', () => {
    const undo = reverse(chart, ledger, breakfast.id, {
      id: meta().id,
      createdAt: at(9),
    });
    const { closed, open } = figures([...ledger, undo]);
    expect(closed.spending).toEqual([{ categoryId: food, amount: usd(3000) }]);
    expect(open.spending).toEqual([{ categoryId: food, amount: usd(2500) }]);
  });

  it('is unchanged when the paycheck is the first entry of its day', () => {
    const first = [
      openingUsd('2026-02-20', 50000),
      pay,
      spent('2026-04-01', 1200, 5),
      spent('2026-04-01', 3000, 6),
    ];
    const { closed, open } = figures(first);
    expect(closed.spending).toEqual([]);
    expect(open.spending).toEqual([{ categoryId: food, amount: usd(4200) }]);
  });
});

describe('a budget period follows the cut', () => {
  const foodBudget: Budget = {
    id: budgetId('food'),
    name: 'food',
    target: { kind: 'category', categoryId: food },
    mode: 'daily',
    leftover: 'free',
    startedOn: day('2026-02-18'),
    endedOn: null,
    amounts: [{ from: day('2026-02-18'), amount: usd(90_000) }],
  };

  it('counts what came before the paycheck in the closing period', () => {
    const v = view(ledger, {
      budgets: {
        budgets: [foodBudget],
        categories: new Map([[food, { parent: null, mergedInto: null }]]),
        entryTags: new Map(),
      },
    });
    const line = budgetStatus(v, today).lines[0];
    expect(line?.spent).toEqual(usd(2500));
  });
});

describe('cycle membership properties', () => {
  const entry = fc.record({
    offset: fc.integer({ min: 0, max: 70 }),
    amount: fc.integer({ min: 1, max: 50_000 }),
    pay: fc.boolean(),
  });

  function build(
    entries: readonly (typeof entry extends fc.Arbitrary<infer T>
      ? T
      : never)[],
    order: (index: number, offset: number, pay: boolean) => number,
  ): Transaction[] {
    return [
      openingUsd('2026-02-18', 100_000),
      ...entries.map((e, i) => {
        const on = addDays(day('2026-02-18'), e.offset);
        const n = order(i, e.offset, e.pay);
        return e.pay ? paid(on, e.amount, n) : spent(on, e.amount, n);
      }),
    ];
  }

  it('puts every entry in exactly one cycle and sums spending across them', () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 25 }), (entries) => {
        const ledgerOf = build(entries, (i) => i);
        const v = view(ledgerOf);
        const end = day('2026-05-31');
        const cycles = cyclesOf(v, end);
        const spans = cycles.map((c) => cycleSpan(ledgerOf, cycles, c, end));
        for (const t of ledgerOf) {
          expect(spans.filter((s) => s.has(t))).toHaveLength(1);
        }
        const total = ledgerOf
          .filter((t) => t.kind === 'expense')
          .reduce(
            (sum, t) => sum + (t.postings[0]?.amount.amountMinor ?? 0),
            0,
          );
        const split = cycles.reduce(
          (sum, c) =>
            sum +
            cycleSnapshot(v, c, end, cycles).spending.reduce(
              (s, row) => s + row.amount.amountMinor,
              0,
            ),
          0,
        );
        expect(split + total).toBe(0);
      }),
    );
  });

  it('never changes a cycle when an entry moves within a day with no paycheck', () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 25 }), (entries) => {
        const payDays = new Set(
          entries.filter((e) => e.pay).map((e) => e.offset),
        );
        const end = day('2026-05-31');
        const snapshots = (
          order: (i: number, o: number, p: boolean) => number,
        ) => {
          const v = view(build(entries, order));
          const cycles = cyclesOf(v, end);
          return cycles.map((c) => cycleSnapshot(v, c, end, cycles));
        };
        const same = snapshots((i) => i);
        // The same entries recorded in the opposite order on days without a
        // paycheck.
        const moved = snapshots((i, o) =>
          payDays.has(o) ? i : entries.length - i,
        );
        expect(moved.map((s) => [s.spending, s.opening, s.closing])).toEqual(
          same.map((s) => [s.spending, s.opening, s.closing]),
        );
      }),
    );
  });
});
