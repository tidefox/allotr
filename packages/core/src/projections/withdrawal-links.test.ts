import { money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { accountBalances } from '../ledger/balances.ts';
import { expense, transfer } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, meta } from '../ledger/testing.ts';
import type { Transaction } from '../ledger/types.ts';
import { cycleAllocation } from './allocation.ts';
import { countedSpendLines } from './budgets.ts';
import { dailyFiguresOn } from './daily.ts';
import { cycleSnapshot } from './snapshot.ts';
import { cyclesOf } from './cycles.ts';
import {
  card,
  cash,
  chart,
  day,
  openingUsd,
  paycheck,
  savings,
  view,
  wallet,
} from './testing.ts';
import { billId, type LedgerView } from './types.ts';
import {
  budgetView,
  checkLink,
  linkValidity,
  validLinks,
  withdrawalLinkId,
  type WithdrawalLink,
} from './withdrawal-links.ts';

// ADR 0038 with made-up figures. The cycle opens with a paycheck on
// 2026-03-01, so $3,500 is on budget and $5,000 in savings.

const usd = (amountMinor: number) => money(amountMinor, 'USD');

function withdraw(on: string, amountMinor: number, to = card) {
  return transfer(chart, meta(on), {
    fromId: savings,
    toId: to,
    sent: usd(amountMinor),
    received: usd(amountMinor),
  });
}

function buy(on: string, amountMinor: number, from = card) {
  return expense(chart, meta(on), {
    accountId: from,
    amount: usd(amountMinor),
    categoryId: food,
  });
}

function link(
  id: string,
  w: Transaction,
  e: Transaction,
  amountMinor: number,
): WithdrawalLink {
  return {
    id: withdrawalLinkId(id),
    withdrawalId: w.id,
    expenseId: e.id,
    amount: usd(amountMinor),
  };
}

const base = () => [
  openingUsd('2026-02-20', 200000),
  openingUsd('2026-02-20', 500000, savings),
  paycheck('2026-03-01', 150000),
];

function figures(v: LedgerView, on: string) {
  return dailyFiguresOn(v, day(on));
}

describe('budgetView', () => {
  it('counts only the unlinked part the day of a withdrawal and a purchase', () => {
    const w = withdraw('2026-03-10', 30000);
    const e = buy('2026-03-10', 34000);
    const ledger = [...base(), w, e];
    const linked = view(ledger, { withdrawalLinks: [link('l1', w, e, 30000)] });
    const plain = view(ledger);

    expect(figures(plain, '2026-03-10')).toMatchObject({
      startOfDay: usd(380000),
      spentToday: usd(34000),
    });
    expect(figures(linked, '2026-03-10')).toMatchObject({
      startOfDay: usd(350000),
      spentToday: usd(4000),
      available: usd(346000),
      cycleSpent: usd(4000),
    });
    // The bank's view: balances read the real postings.
    const balances = accountBalances(linked.ledger, day('2026-03-10'));
    expect(balances.get(card)).toEqual(usd(346000));
    expect(balances.get(savings)).toEqual(usd(470000));
  });

  it('holds the money between a withdrawal and a later purchase', () => {
    const w = withdraw('2026-03-10', 30000);
    const e = buy('2026-03-13', 34000);
    const ledger = [...base(), w, e];
    const linked = view(ledger, { withdrawalLinks: [link('l1', w, e, 30000)] });
    const plain = view(ledger);

    expect(figures(plain, '2026-03-11').available).toEqual(usd(380000));
    expect(figures(linked, '2026-03-11').available).toEqual(usd(350000));
    expect(figures(linked, '2026-03-13')).toMatchObject({
      available: usd(346000),
      spentToday: usd(4000),
    });
    expect(figures(linked, '2026-03-13').available).toEqual(
      figures(plain, '2026-03-13').available,
    );
  });

  it('does not take the amount out before a later withdrawal', () => {
    const e = buy('2026-03-10', 34000);
    const w = withdraw('2026-03-13', 30000);
    const ledger = [...base(), e, w];
    const linked = view(ledger, { withdrawalLinks: [link('l1', w, e, 30000)] });
    const plain = view(ledger);

    expect(figures(plain, '2026-03-11').available).toEqual(usd(316000));
    expect(figures(linked, '2026-03-11').available).toEqual(usd(346000));
    expect(figures(linked, '2026-03-13').available).toEqual(usd(346000));
    expect(figures(linked, '2026-03-13').startOfDay).toEqual(usd(346000));
  });

  it('links part of a withdrawal and part of a purchase', () => {
    const w = withdraw('2026-03-10', 30000);
    const e = buy('2026-03-10', 34000);
    const ledger = [...base(), w, e];
    const linked = view(ledger, { withdrawalLinks: [link('l1', w, e, 10000)] });
    expect(figures(linked, '2026-03-10')).toMatchObject({
      startOfDay: usd(370000),
      spentToday: usd(24000),
    });
  });

  it('adds several links on one entry', () => {
    const w = withdraw('2026-03-10', 30000);
    const e1 = buy('2026-03-10', 20000);
    const e2 = buy('2026-03-10', 20000);
    const ledger = [...base(), w, e1, e2];
    const linked = view(ledger, {
      withdrawalLinks: [link('l1', w, e1, 20000), link('l2', w, e2, 10000)],
    });
    expect(figures(linked, '2026-03-10')).toMatchObject({
      startOfDay: usd(350000),
      spentToday: usd(10000),
    });
  });

  it('takes the link out when either entry is undone', () => {
    const w = withdraw('2026-03-10', 30000);
    const e = buy('2026-03-10', 34000);
    const links = [link('l1', w, e, 30000)];
    const undoE = reverse(chart, [w, e], e.id, {
      id: meta().id,
      createdAt: '2026-03-11T00:00:00.000Z',
    });
    const undoW = reverse(chart, [w, e], w.id, {
      id: meta().id,
      createdAt: '2026-03-11T00:00:00.000Z',
    });
    for (const [ledger, reason] of [
      [[...base(), w, e, undoE], 'expense_undone'],
      [[...base(), w, e, undoW], 'withdrawal_undone'],
    ] as const) {
      const linked = view(ledger, { withdrawalLinks: links });
      expect(linkValidity(linked).dropped.map((d) => d.reason)).toEqual([
        reason,
      ]);
      expect(budgetView(linked)).toBe(linked);
      expect(figures(linked, '2026-03-12')).toEqual(
        figures(view(ledger), '2026-03-12'),
      );
    }
  });

  it('keeps the whole expense in the category totals', () => {
    const w = withdraw('2026-03-10', 30000);
    const e = buy('2026-03-10', 34000);
    const ledger = [...base(), w, e];
    const linked = view(ledger, { withdrawalLinks: [link('l1', w, e, 30000)] });
    const today = day('2026-03-12');
    const snapshotOf = (v: LedgerView) => {
      const cycle = cyclesOf(v, today).at(-1);
      if (cycle === undefined) throw new Error('no cycle');
      return cycleSnapshot(v, cycle, today);
    };
    expect(snapshotOf(linked).spending).toEqual([
      { categoryId: food, amount: usd(34000) },
    ]);
    expect(snapshotOf(linked).spending).toEqual(
      snapshotOf(view(ledger)).spending,
    );
    // The rewritten ledger still reaches Expenses for the whole purchase.
    const rewritten = budgetView(linked).ledger.find((t) => t.id === e.id);
    expect(
      rewritten?.postings.find((p) => p.categoryId === food)?.amount,
    ).toEqual(usd(34000));
  });

  it('does not count the linked part as money moved to savings', () => {
    const w = withdraw('2026-03-10', 30000);
    const e = buy('2026-03-10', 34000);
    const ledger = [...base(), w, e];
    const linked = view(ledger, { withdrawalLinks: [link('l1', w, e, 30000)] });
    const plain = cycleAllocation(view(ledger), day('2026-03-12'));
    const withLink = cycleAllocation(linked, day('2026-03-12'));
    expect(plain.savings).toEqual(usd(-30000));
    expect(withLink.savings).toEqual(usd(0));
    expect(withLink.spent).toEqual(usd(4000));
  });

  it('counts only the unlinked part against a budget', () => {
    const w = withdraw('2026-03-10', 30000);
    const e = buy('2026-03-10', 34000);
    const ledger = [...base(), w, e];
    const today = day('2026-03-12');
    const spent = (v: LedgerView) =>
      countedSpendLines(v, today, new Set(), new Set()).reduce(
        (total, line) => total + line.amount,
        0n,
      );
    expect(spent(view(ledger))).toBe(34000n);
    expect(
      spent(view(ledger, { withdrawalLinks: [link('l1', w, e, 30000)] })),
    ).toBe(4000n);
    expect(
      spent(view(ledger, { withdrawalLinks: [link('l1', w, e, 34000)] })),
    ).toBe(34000n);
  });

  it('rewrites entries that still balance, with the same ids', () => {
    const w = withdraw('2026-03-10', 30000);
    const e = buy('2026-03-10', 30000);
    const ledger = [...base(), w, e];
    const rewritten = budgetView(
      view(ledger, { withdrawalLinks: [link('l1', w, e, 30000)] }),
    ).ledger;
    expect(rewritten.map((t) => t.id)).toEqual(ledger.map((t) => t.id));
    for (const t of rewritten) {
      const sums = new Map<string, number>();
      for (const p of t.postings) {
        sums.set(
          p.amount.currency,
          (sums.get(p.amount.currency) ?? 0) + p.amount.amountMinor,
        );
      }
      expect([...sums.values()].every((s) => s === 0)).toBe(true);
    }
    // Fully linked: the transfer moves nothing for the budget.
    expect(
      rewritten
        .find((t) => t.id === w.id)
        ?.postings.map((p) => p.amount.amountMinor),
    ).toEqual([0, 0]);
    // Real ledger untouched.
    expect(w.postings.map((p) => p.amount.amountMinor)).toEqual([
      -30000, 30000,
    ]);
  });

  it('returns the same view without valid links and shares the rewrite', () => {
    const w = withdraw('2026-03-10', 30000);
    const e = buy('2026-03-10', 34000);
    const ledger = [...base(), w, e];
    const plain = view(ledger);
    expect(budgetView(plain)).toBe(plain);
    const empty = view(ledger, { withdrawalLinks: [] });
    expect(budgetView(empty)).toBe(empty);
    const bad = view(ledger, {
      withdrawalLinks: [link('l1', w, e, 99999999)],
    });
    expect(budgetView(bad)).toBe(bad);

    const links = [link('l1', w, e, 30000)];
    const first = budgetView(view(ledger, { withdrawalLinks: links }));
    const second = budgetView(view(ledger, { withdrawalLinks: links }));
    expect(second.ledger).toBe(first.ledger);
    expect(first.withdrawalLinks).toBeUndefined();
    expect(budgetView(first)).toBe(first);
  });
});

describe('link validity', () => {
  const w = withdraw('2026-03-10', 30000);
  const e = buy('2026-03-10', 34000);
  const ledger = [...base(), w, e];

  it('accepts a link that fits', () => {
    expect(checkLink(view(ledger), link('l1', w, e, 30000))).toBeNull();
    expect(
      validLinks(view(ledger, { withdrawalLinks: [link('l1', w, e, 1)] })),
    ).toHaveLength(1);
  });

  it('refuses each way a link can not hold', () => {
    const betweenOwn = transfer(chart, meta('2026-03-10'), {
      fromId: card,
      toId: cash,
      sent: usd(100),
      received: usd(100),
    });
    const paycheckEntry = base()[2] as Transaction;
    const euros = expense(chart, meta('2026-03-10'), {
      accountId: wallet,
      amount: money(5000, 'EUR'),
      categoryId: food,
    });
    const fromSavings = buy('2026-03-10', 1000, savings);
    const all = [...ledger, betweenOwn, euros, fromSavings, paycheckEntry];
    const check = (l: WithdrawalLink, extra: Partial<LedgerView> = {}) =>
      checkLink(view(all, extra), l);
    const unknown = meta().id;
    expect(check({ ...link('l1', w, e, 1), withdrawalId: unknown })).toBe(
      'withdrawal_missing',
    );
    expect(check({ ...link('l1', w, e, 1), expenseId: unknown })).toBe(
      'expense_missing',
    );
    expect(check(link('l1', w, fromSavings, 1))).toBe('expense_not_on_budget');
    expect(check(link('l1', betweenOwn, e, 1))).toBe(
      'withdrawal_not_from_savings',
    );
    expect(check(link('l1', paycheckEntry, e, 1))).toBe(
      'withdrawal_not_transfer',
    );
    expect(check(link('l1', w, paycheckEntry, 1))).toBe('expense_not_expense');
    expect(check(link('l1', w, e, 0))).toBe('amount_not_positive');
    expect(check(link('l1', w, e, -5))).toBe('amount_not_positive');
    expect(check(link('l1', w, euros, 1))).toBe('currency_mismatch');
    expect(check(link('l1', w, e, 30001))).toBe('withdrawal_exceeded');
    expect(check(link('l1', w, e, 1), { outsideFunded: new Set([e.id]) })).toBe(
      'expense_outside_funded',
    );
    const rent = {
      id: billId('rent'),
      amount: usd(100),
      dueDay: 5,
      payments: [
        {
          dueOn: day('2026-03-05'),
          paidOn: day('2026-03-10'),
          transactionId: e.id,
        },
      ],
    };
    expect(check(link('l1', w, e, 1), { bills: [rent] })).toBe(
      'expense_bill_payment',
    );
  });

  it('refuses an undone entry on either side', () => {
    const undoE = reverse(chart, [w, e], e.id, {
      id: meta().id,
      createdAt: '2026-03-11T00:00:00.000Z',
    });
    const undoW = reverse(chart, [w, e], w.id, {
      id: meta().id,
      createdAt: '2026-03-11T00:00:00.000Z',
    });
    expect(checkLink(view([...ledger, undoE]), link('l1', w, e, 1))).toBe(
      'expense_undone',
    );
    expect(checkLink(view([...ledger, undoW]), link('l1', w, e, 1))).toBe(
      'withdrawal_undone',
    );
    expect(checkLink(view([...ledger, undoW]), link('l1', undoW, e, 1))).toBe(
      'withdrawal_not_transfer',
    );
  });

  it('refuses a purchase that is bigger than what the expense paid', () => {
    const small = buy('2026-03-10', 5000);
    const v = view([...ledger, small]);
    expect(checkLink(v, link('l1', w, small, 5000))).toBeNull();
    expect(checkLink(v, link('l1', w, small, 5001))).toBe('expense_exceeded');
  });

  it('sums the links on each entry and drops the surplus by id', () => {
    const second = buy('2026-03-10', 34000);
    const v = view([...ledger, second], {
      withdrawalLinks: [
        link('b', w, second, 20000),
        link('a', w, e, 20000),
        link('c', w, e, 5000),
      ],
    });
    const { valid, dropped } = linkValidity(v);
    expect(valid.map((l) => l.id)).toEqual(['a', 'c']);
    expect(dropped.map((d) => [d.link.id, d.reason])).toEqual([
      ['b', 'withdrawal_exceeded'],
    ]);
    // A new link is judged on top of those that count.
    expect(checkLink(v, link('d', w, second, 5001))).toBe(
      'withdrawal_exceeded',
    );
    expect(checkLink(v, link('d', w, second, 5000))).toBeNull();
  });

  it('refuses a withdrawal between currencies', () => {
    const cross = transfer(chart, meta('2026-03-10'), {
      fromId: savings,
      toId: wallet,
      sent: usd(1000),
      received: money(900, 'EUR'),
    });
    const v = view([...ledger, cross]);
    expect(checkLink(v, link('l1', cross, e, 500))).toBe('currency_mismatch');
  });
});
