import { currencyCode, money, parseRate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { budgetSwitch, transfer } from '../ledger/build.ts';
import { lend } from '../ledger/ious.ts';
import { reverse } from '../ledger/reverse.ts';
import { food, meta } from '../ledger/testing.ts';
import { cycleAllocation, reservedParts } from './allocation.ts';
import { dailyFiguresOn } from './daily.ts';
import {
  card,
  chart,
  day,
  openingUsd,
  paycheck,
  savings,
  spend,
  view,
  wallet,
} from './testing.ts';
import { billId, type Bill } from './types.ts';

// All figures are made up. The cycle opens with the 1 March paycheck.

const usd = (amountMinor: number) => money(amountMinor, 'USD');

const rent: Bill = {
  id: billId('rent'),
  amount: usd(20000),
  dueDay: 5,
  payments: [],
};
const power: Bill = {
  id: billId('power'),
  amount: usd(8000),
  dueDay: 20,
  payments: [],
};

const rentPaid = spend('2026-03-05', 20000);
const paidRent: Bill = {
  ...rent,
  payments: [
    {
      dueOn: day('2026-03-05'),
      paidOn: day('2026-03-05'),
      transactionId: rentPaid.id,
    },
  ],
};
const ledger = [
  openingUsd('2026-02-20', 50000),
  paycheck('2026-03-01', 300000),
  spend('2026-03-03', 4000),
  transfer(chart, meta('2026-03-04'), {
    fromId: card,
    toId: savings,
    sent: usd(50000),
  }),
  rentPaid,
];
const today = day('2026-03-10');

describe('cycleAllocation', () => {
  it('splits the cycle start into the five parts', () => {
    const allocation = cycleAllocation(
      view(ledger, { bills: [paidRent, power] }),
      today,
    );
    expect(allocation).toEqual({
      start: usd(350000),
      paycheck: usd(300000),
      carried: usd(50000),
      paidBills: usd(20000),
      savings: usd(50000),
      spent: usd(4000),
      reserved: usd(8000),
      free: usd(268000),
      other: usd(0),
      shareBp: {
        paidBills: 571,
        savings: 1429,
        spent: 114,
        reserved: 229,
        free: 7657,
        other: 0,
      },
      missingRates: [],
    });
  });

  it('agrees with the daily figures', () => {
    const v = view(ledger, { bills: [paidRent, power] });
    const figures = dailyFiguresOn(v, today);
    const allocation = cycleAllocation(v, today);
    expect(allocation.free).toEqual(figures.available);
    expect(allocation.reserved).toEqual(figures.reserved);
    expect(
      allocation.paidBills.amountMinor + allocation.spent.amountMinor,
    ).toBe(figures.cycleSpent.amountMinor);
  });

  it('counts an unlinked bill payment as spending', () => {
    const unlinked: Bill = {
      ...rent,
      payments: [{ dueOn: day('2026-03-05'), paidOn: day('2026-03-05') }],
    };
    const allocation = cycleAllocation(
      view(ledger, { bills: [unlinked] }),
      today,
    );
    expect(allocation.paidBills).toEqual(usd(0));
    expect(allocation.spent).toEqual(usd(24000));
  });

  it('takes a payment back with its undo', () => {
    const undo = reverse(chart, ledger, rentPaid.id, meta('2026-03-06'));
    const allocation = cycleAllocation(
      view([...ledger, undo], { bills: [rent] }),
      today,
    );
    expect(allocation).toMatchObject({
      paidBills: usd(0),
      spent: usd(4000),
      reserved: usd(20000),
    });
  });

  it('shows money returned from savings as a negative part', () => {
    const back = transfer(chart, meta('2026-03-08'), {
      fromId: savings,
      toId: card,
      sent: usd(70000),
    });
    const allocation = cycleAllocation(
      view([...ledger, back], { bills: [paidRent] }),
      today,
    );
    expect(allocation.savings).toEqual(usd(-20000));
  });

  it('counts an account moved off budget as moved to savings', () => {
    const moved = budgetSwitch(
      chart,
      [],
      meta('2026-03-07'),
      { accountId: card, budgetGroup: 'off' },
      'on',
    );
    const allocation = cycleAllocation(view([...ledger, moved]), today);
    // Nothing is left on budget: all but the spending went to savings.
    expect(allocation.free).toEqual(usd(0));
    expect(allocation.savings).toEqual(usd(350000 - 4000 - 20000));
  });

  it('is all free money when nothing has happened in the cycle', () => {
    const allocation = cycleAllocation(
      view([openingUsd('2026-02-20', 50000), paycheck('2026-04-01', 300000)]),
      day('2026-04-01'),
    );
    expect(allocation).toEqual({
      start: usd(350000),
      paycheck: usd(300000),
      carried: usd(50000),
      paidBills: usd(0),
      savings: usd(0),
      spent: usd(0),
      reserved: usd(0),
      free: usd(350000),
      other: usd(0),
      shareBp: {
        paidBills: 0,
        savings: 0,
        spent: 0,
        reserved: 0,
        free: 10000,
        other: 0,
      },
      missingRates: [],
    });
  });

  it('changes when an entry is back-dated into the cycle', () => {
    const before = cycleAllocation(view(ledger, { bills: [paidRent] }), today);
    const after = cycleAllocation(
      view([...ledger, spend('2026-03-02', 1500, food)], { bills: [paidRent] }),
      today,
    );
    expect(after.spent.amountMinor - before.spent.amountMinor).toBe(1500);
    expect(after.free.amountMinor - before.free.amountMinor).toBe(-1500);
    expect(after.start).toEqual(before.start);
  });

  it('converts other currencies once and keeps the parts adding up', () => {
    const euros = [
      ...ledger,
      transfer(chart, meta('2026-03-06'), {
        fromId: card,
        toId: wallet,
        sent: usd(11000),
        received: money(10000, 'EUR'),
      }),
      spend('2026-03-07', 1000, food, wallet),
    ];
    const rates = [
      {
        base: currencyCode('EUR'),
        quote: currencyCode('USD'),
        rate: parseRate('1.2'),
        asOf: day('2026-03-01'),
      },
    ];
    const v = view(euros, { bills: [paidRent], rates });
    const a = cycleAllocation(v, today);
    // EUR 10.00 spent is USD 12.00.
    expect(a.spent).toEqual(usd(4000 + 1200));
    expect(a.free).toEqual(dailyFiguresOn(v, today).available);
    expect(a.missingRates).toEqual([]);
    const sum = [
      a.paidBills,
      a.savings,
      a.spent,
      a.reserved,
      a.free,
      a.other,
    ].reduce((total, part) => total + part.amountMinor, 0);
    expect(a.start.amountMinor).toBe(sum);

    const missing = cycleAllocation(view(euros, { bills: [paidRent] }), today);
    expect(missing.missingRates).toEqual(['EUR']);
  });

  it('puts money lent under other, not savings', () => {
    const loan = lend(chart, meta('2026-03-06'), {
      accountId: card,
      owed: [usd(2500)],
    });
    const a = cycleAllocation(
      view([...ledger, loan], { bills: [paidRent] }),
      today,
    );
    expect(a.savings).toEqual(usd(50000));
    expect(a.other).toEqual(usd(2500));
    expect(a.free).toEqual(usd(276000 - 2500));
  });

  it('does not count a payment out of savings as savings', () => {
    const a = cycleAllocation(
      view([...ledger, spend('2026-03-06', 3000, food, savings)], {
        bills: [paidRent],
      }),
      today,
    );
    expect(a.savings).toEqual(usd(50000));
    expect(a.other).toEqual(usd(0));
  });
});

describe('reservedParts', () => {
  it('splits the reserve into bills and what is owed, adding up to reserved', () => {
    const v = view(ledger, { bills: [paidRent, power] });
    const parts = reservedParts(v, today);
    expect(parts.bills).toEqual(usd(8000));
    expect(parts.ious).toEqual(usd(0));
    expect(parts.bills.amountMinor + parts.ious.amountMinor).toBe(
      dailyFiguresOn(v, today).reserved.amountMinor,
    );
  });
});

describe('cycleAllocation paycheck and carried', () => {
  it('counts every income this cycle as the paycheck and the rest as carried', () => {
    const v = view([
      openingUsd('2026-02-20', 120000),
      paycheck('2026-03-01', 250000),
      paycheck('2026-03-05', 5000),
      spend('2026-03-06', 1000),
    ]);
    const a = cycleAllocation(v, day('2026-03-10'));
    expect(a.paycheck).toEqual(usd(255000));
    expect(a.carried).toEqual(usd(120000));
    expect(a.start).toEqual(usd(375000));
  });

  it('carries nothing over when the ledger starts with the cycle', () => {
    const a = cycleAllocation(
      view([paycheck('2026-03-01', 90000)]),
      day('2026-03-10'),
    );
    expect(a.paycheck).toEqual(usd(90000));
    expect(a.carried).toEqual(usd(0));
  });

  it('does not count an account opened in the cycle as income', () => {
    const a = cycleAllocation(
      view([
        paycheck('2026-03-01', 90000),
        openingUsd('2026-03-04', 40000, savings),
      ]),
      day('2026-03-10'),
    );
    expect(a.paycheck).toEqual(usd(90000));
    expect(a.carried.amountMinor + a.paycheck.amountMinor).toBe(
      a.start.amountMinor,
    );
  });
});
