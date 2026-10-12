import { money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { income } from '../ledger/build.ts';
import { reverse } from '../ledger/reverse.ts';
import { meta } from '../ledger/testing.ts';
import { categoryId } from '../ledger/types.ts';
import { calendar } from './calendar.ts';
import { dailyFiguresOn, paceExclusions } from './daily.ts';
import { outsideEntries } from './funding.ts';
import { cycleReports } from './history.ts';
import { netWorthOn } from './plan.ts';
import { accountBalances } from '../ledger/balances.ts';
import { card, chart, day, paycheck, spend, viewFrom } from './testing.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const gifts = categoryId('gifts');

// Made-up month: pay on the 1st, a gift of 4,000 in on the 4th, a 3,983
// purchase on the 5th that the gift paid for, and ordinary spending.
const gift = income(chart, meta('2026-04-04'), {
  accountId: card,
  amount: usd(400000),
  categoryId: gifts,
});
const purchase = spend('2026-04-05', 398300);
const ordinary = [spend('2026-04-03', 2500), spend('2026-04-06', 1200)];
const ledger = [paycheck('2026-04-01', 300000), gift, purchase, ...ordinary];
const today = day('2026-04-10');
const base = viewFrom('2026-04-01', ledger);
const flagged = {
  ...base,
  incomeClasses: new Map([[gifts, 'gift' as const]]),
  outsideFunded: new Set([purchase.id]),
};

describe('outside-funded expenses', () => {
  it('follow an undo to the entry it undoes', () => {
    const undo = reverse(chart, ledger, purchase.id, meta('2026-04-05'));
    const v = { ...flagged, ledger: [...ledger, undo] };
    expect(outsideEntries(v)).toEqual(new Set([purchase.id, undo.id]));
    expect(paceExclusions(v).has(undo.id)).toBe(true);
  });

  it('leave the cycle report spending, shown apart', () => {
    const [report] = cycleReports(flagged, today);
    expect(report?.spending).toEqual(usd(3700));
    expect(report?.outsideSpending).toEqual(usd(398300));
    expect(report?.income).toEqual(usd(300000));
    expect(report?.otherInflows).toEqual(usd(400000));
    expect(report?.spendingByCategory.map((c) => c.amount)).toEqual([
      usd(3700),
    ]);
    expect(report?.outsideByCategory.map((c) => c.amount)).toEqual([
      usd(398300),
    ]);
  });

  it('count in the report when nothing is flagged', () => {
    const [report] = cycleReports(base, today);
    expect(report?.spending).toEqual(usd(402000));
    expect(report?.outsideSpending).toEqual(usd(0));
  });

  it('leave pace and calendar heat, not the figures that follow money', () => {
    const plain = dailyFiguresOn(base, today);
    const figures = dailyFiguresOn(flagged, today);
    expect(plain.paceSpent).toEqual(usd(402000));
    expect(figures.paceSpent).toEqual(usd(3700));
    expect(figures.cycleSpent).toEqual(plain.cycleSpent);
    expect(figures.available).toEqual(plain.available);
    expect(figures.liveDaily).toEqual(plain.liveDaily);

    const days = calendar(
      flagged,
      day('2026-04-01'),
      day('2026-04-10'),
      today,
    ).days;
    expect(days.find((d) => d.date === '2026-04-05')?.spent).toEqual(usd(0));
    // Shown muted beside the day, and out of the heat.
    expect(days.find((d) => d.date === '2026-04-05')?.outsideSpent).toEqual(
      usd(398300),
    );
    expect(days.find((d) => d.date === '2026-04-06')?.outsideSpent).toEqual(
      usd(0),
    );
  });

  it('never change balances, net worth or the daily number', () => {
    fc.assert(
      fc.property(
        fc.subarray(ledger.map((t) => t.id)),
        fc.boolean(),
        (ids, keepOutside) => {
          const marked = {
            ...base,
            outsideFunded: new Set(ids),
            settings: { ...base.settings, outsideConsumesBudgets: keepOutside },
          };
          expect(accountBalances(marked.ledger, today)).toEqual(
            accountBalances(base.ledger, today),
          );
          expect(netWorthOn(marked, today)).toEqual(netWorthOn(base, today));
          const a = dailyFiguresOn(marked, today);
          const b = dailyFiguresOn(base, today);
          expect(a.available).toEqual(b.available);
          expect(a.liveDaily).toEqual(b.liveDaily);
          expect(a.todayAllowance).toEqual(b.todayAllowance);
          expect(a.spentToday).toEqual(b.spentToday);
        },
      ),
    );
  });
});
