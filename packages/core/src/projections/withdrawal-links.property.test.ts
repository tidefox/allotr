import {
  addDays,
  currencyCode,
  localDate,
  money,
  parseRate,
  type LocalDate,
} from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { accountBalances } from '../ledger/balances.ts';
import { expense, income, opening, transfer } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, salary, testChart, testCurrencies } from '../ledger/testing.ts';
import {
  accountId,
  transactionId,
  type Posting,
  type Transaction,
} from '../ledger/types.ts';
import { cycleAllocation } from './allocation.ts';
import { calendar } from './calendar.ts';
import { cyclesOf } from './cycles.ts';
import { dailyFiguresOn } from './daily.ts';
import { poolCycleFigures } from './pool-cycle.ts';
import { cycleDays } from './series.ts';
import { weeklyReview } from './plan.ts';
import { billId, type ExchangeRate, type LedgerView } from './types.ts';
import {
  budgetView,
  linkValidity,
  validLinks,
  withdrawalLinkId,
  type WithdrawalLink,
} from './withdrawal-links.ts';

// ADR 0038: on every day, every budget figure for a ledger with links equals
// the figure for the same ledger rewritten by hand so each linked amount is
// paid straight from the savings account, while balances read the real
// postings.

const chart = testChart();
const usd = currencyCode('USD');
const start = localDate('2026-03-01');
const days = Array.from({ length: 41 }, (_, i) => addDays(start, i));
const rates: ExchangeRate[] = testCurrencies
  .filter((c) => c !== usd)
  .map((base, i) => ({
    base,
    quote: usd,
    rate: parseRate(['1.1', '0.0067', '3.25'][i] ?? '1'),
    asOf: localDate('2026-02-01'),
  }));

type Op =
  | { t: 'pay' | 'spend' | 'withdraw'; to: number; day: number; amount: number }
  | { t: 'undo'; day: number; pick: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    t: fc.constantFrom('pay' as const, 'spend' as const, 'withdraw' as const),
    to: fc.integer({ min: 0, max: 1 }),
    day: fc.integer({ min: 0, max: 40 }),
    amount: fc.integer({ min: 1, max: 5_000_000 }),
  }),
  fc.record({
    t: fc.constant('undo' as const),
    day: fc.constant(0),
    pick: fc.nat(),
  }),
);

const scenarioArb = fc.record({
  currency: fc.constantFrom(...testCurrencies),
  ops: fc.array(opArb, { minLength: 2, maxLength: 24 }),
  links: fc.array(
    fc.record({
      w: fc.nat(),
      e: fc.nat(),
      share: fc.integer({ min: 1, max: 100 }),
    }),
    { maxLength: 6 },
  ),
  paydayDay: fc.integer({ min: 1, max: 28 }),
});

type Scenario = Readonly<{
  view: LedgerView;
  hand: LedgerView;
  linked: readonly WithdrawalLink[];
}>;

// The hand-built reference: each valid link is applied straight to the two
// entries' postings, with no use of budgetView.
function handBuilt(
  ledger: readonly Transaction[],
  links: readonly WithdrawalLink[],
): Transaction[] {
  const postings = new Map<string, Posting[]>(
    ledger.map((t) => [t.id, [...t.postings]]),
  );
  const shift = (id: string, index: number, delta: number) => {
    const list = postings.get(id);
    const p = list?.[index];
    if (list === undefined || p === undefined) throw new Error('no posting');
    list[index] = {
      ...p,
      amount: money(p.amount.amountMinor + delta, p.amount.currency),
    };
  };
  for (const link of links) {
    const c = link.amount.amountMinor;
    // Transfers and expenses from the builders: postings[0] is the source
    // account, postings[1] the destination (or Expenses).
    shift(link.withdrawalId, 0, c);
    shift(link.withdrawalId, 1, -c);
    shift(link.expenseId, 0, c);
    const source = ledger.find((t) => t.id === link.withdrawalId)?.postings[0];
    if (source === undefined) throw new Error('no source');
    postings.get(link.expenseId)?.push({
      accountId: source.accountId,
      amount: money(-c, link.amount.currency),
      categoryId: null,
    });
  }
  return ledger.map((t) => ({
    ...t,
    postings: postings.get(t.id) ?? t.postings,
  }));
}

function build(s: {
  currency: (typeof testCurrencies)[number];
  ops: readonly Op[];
  links: readonly { w: number; e: number; share: number }[];
  paydayDay: number;
}): Scenario {
  const c = s.currency;
  const accounts = [accountId(`card-${c}`), accountId(`cash-${c}`)] as const;
  const savings = accountId(`savings-${c}`);
  const ledger: Transaction[] = [
    opening(chart, meta(0, '2026-02-20'), {
      accountId: accounts[0],
      amount: money(8_000_000, c),
    }),
    opening(chart, meta(1, '2026-02-20'), {
      accountId: savings,
      amount: money(50_000_000, c),
    }),
  ];
  s.ops.forEach((op, i) => {
    const m = meta(
      i + 2,
      op.t === 'undo' ? '2026-03-01' : (days[op.day] ?? start),
    );
    if (op.t === 'undo') {
      const open = ledger.filter(
        (t) =>
          t.kind !== 'reversal' &&
          t.kind !== 'opening' &&
          !ledger.some((r) => r.reversesId === t.id),
      );
      const target = open[op.pick % Math.max(1, open.length)];
      if (target !== undefined)
        ledger.push(reverse(chart, ledger, target.id, m));
      return;
    }
    const account = accounts[op.to] ?? accounts[0];
    if (op.t === 'pay') {
      ledger.push(
        income(chart, m, {
          accountId: account,
          amount: money(op.amount, c),
          categoryId: salary,
        }),
      );
    } else if (op.t === 'spend') {
      ledger.push(
        expense(chart, m, {
          accountId: account,
          amount: money(op.amount, c),
          categoryId: food,
        }),
      );
    } else {
      ledger.push(
        transfer(chart, m, {
          fromId: savings,
          toId: account,
          sent: money(op.amount, c),
          received: money(op.amount, c),
        }),
      );
    }
  });
  const withdrawals = ledger.filter((t) => t.kind === 'transfer');
  const expenses = ledger.filter((t) => t.kind === 'expense');
  const links: WithdrawalLink[] = [];
  if (withdrawals.length > 0 && expenses.length > 0) {
    s.links.forEach((l, i) => {
      const w = withdrawals[l.w % withdrawals.length];
      const e = expenses[l.e % expenses.length];
      if (w === undefined || e === undefined) return;
      const room = Math.min(
        w.postings[1]?.amount.amountMinor ?? 0,
        -(e.postings[0]?.amount.amountMinor ?? 0),
      );
      const amount = Math.max(1, Math.floor((room * l.share) / 100));
      links.push({
        id: withdrawalLinkId(`l${String(i).padStart(3, '0')}`),
        withdrawalId: w.id,
        expenseId: e.id,
        amount: money(amount, c),
      });
    });
  }
  const base = {
    chart,
    paycheckCategories: new Set([salary]),
    settings: {
      defaultCurrency: usd,
      startedOn: localDate('2026-02-18'),
      paydayRule: 'fixed' as const,
      paydayDay: s.paydayDay,
      paydayOverride: null,
    },
    bills: [
      {
        id: billId('rent'),
        amount: money(100, usd),
        dueDay: 5,
        payments: [],
      },
    ],
    rates,
  };
  const view: LedgerView = { ...base, ledger, withdrawalLinks: links };
  const valid = validLinks(view);
  return {
    view,
    hand: { ...base, ledger: handBuilt(ledger, valid) },
    linked: valid,
  };
}

let counter = 0;
function meta(i: number, on: string | LocalDate) {
  counter += 1;
  return {
    id: transactionId(`t${String(i).padStart(4, '0')}`),
    occurredOn: localDate(on),
    createdAt: `2026-05-01T00:00:${String(i % 60).padStart(2, '0')}.${String(counter % 1000).padStart(3, '0')}Z`,
  };
}

describe('withdrawal links', () => {
  it('come from a generator that produces linked scenarios', () => {
    // A fixed seed, so the check on the generator never flakes.
    const linked = fc
      .sample(scenarioArb, { numRuns: 60, seed: 260 })
      .filter((raw) => build(raw).linked.length > 0);
    expect(linked.length).toBeGreaterThan(5);
  });

  it('give the budget the figures of a purchase paid from savings', () => {
    fc.assert(
      fc.property(scenarioArb, (raw) => {
        const { view, hand } = build(raw);
        for (const date of days) {
          expect(dailyFiguresOn(view, date)).toEqual(
            dailyFiguresOn(hand, date),
          );
        }
        const today = days.at(-1) ?? start;
        const cycle = cyclesOf(view, today).at(-1);
        if (cycle === undefined) throw new Error('no cycle');
        expect(cycleDays(view, cycle, today)).toEqual(
          cycleDays(hand, cycle, today),
        );
        expect(cycleAllocation(view, today)).toEqual(
          cycleAllocation(hand, today),
        );
        expect(poolCycleFigures(view, today)).toEqual(
          poolCycleFigures(hand, today),
        );
        expect(calendar(view, start, addDays(start, 40), today)).toEqual(
          calendar(hand, start, addDays(start, 40), today),
        );
        expect(weeklyReview(view, today)).toEqual(weeklyReview(hand, today));
      }),
      { numRuns: 60 },
    );
  });

  it('leave balances and the ledger as they are', () => {
    fc.assert(
      fc.property(scenarioArb, (raw) => {
        const { view, linked } = build(raw);
        const before = JSON.stringify(view.ledger);
        const rewritten = budgetView(view);
        expect(JSON.stringify(view.ledger)).toBe(before);
        expect(rewritten.ledger.map((t) => t.id)).toEqual(
          view.ledger.map((t) => t.id),
        );
        // Every rewritten entry still balances per currency.
        for (const t of rewritten.ledger) {
          const sums = new Map<string, number>();
          for (const p of t.postings) {
            sums.set(
              p.amount.currency,
              (sums.get(p.amount.currency) ?? 0) + p.amount.amountMinor,
            );
          }
          expect([...sums.values()].every((sum) => sum === 0)).toBe(true);
        }
        // Once both entries of every link are behind, the rewrite moved
        // nothing across the on/off line and no money was created.
        const last = linked.reduce((latest, l) => {
          const dates = [l.withdrawalId, l.expenseId].map(
            (id) => view.ledger.find((t) => t.id === id)?.occurredOn ?? start,
          );
          return [latest, ...dates].reduce((a, b) => (a > b ? a : b));
        }, start);
        const real = accountBalances(view.ledger, last);
        const seen = accountBalances(rewritten.ledger, last);
        const group = (id: string) =>
          view.chart.get(accountId(id))?.budgetGroup;
        const net = (balances: typeof real, wanted: 'on' | 'off') =>
          [...balances].reduce(
            (sum, [id, balance]) =>
              group(id) === wanted ? sum + balance.amountMinor : sum,
            0,
          );
        expect(net(seen, 'on')).toBe(net(real, 'on'));
        expect(net(seen, 'off')).toBe(net(real, 'off'));
      }),
      { numRuns: 60 },
    );
  });

  it('leave undone entries out and keep every id unique', () => {
    fc.assert(
      fc.property(scenarioArb, (raw) => {
        const { view } = build(raw);
        const { valid, dropped } = linkValidity(view);
        const all = view.withdrawalLinks ?? [];
        expect(valid.length + dropped.length).toBe(all.length);
        const ids = [...valid, ...dropped.map((d) => d.link)].map((l) => l.id);
        expect(new Set(ids).size).toBe(all.length);
      }),
      { numRuns: 60 },
    );
  });
});
