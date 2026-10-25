import {
  money,
  type AccountView,
  type CategoryView,
  type TransactionView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { dashboardEntries, entryAmountKind } from './todays-entries-model.ts';

// Made-up accounts, categories and entries.
const usd = (amountMinor: number) => money(amountMinor, 'USD');
const accounts = [{ id: 'a-everyday', name: 'Everyday' }] as AccountView[];
const categories = [
  { id: 'c-food', name: 'Food', colour: 'series-6', icon: null },
] as CategoryView[];

function entry(overrides: Partial<TransactionView>): TransactionView {
  return {
    id: 'e-1',
    kind: 'expense',
    occurredOn: '2026-03-11',
    occurredTime: '12:30:00',
    categoryId: null,
    note: null,
    postings: [
      {
        accountId: 'a-everyday',
        systemRole: null,
        amount: usd(-1250),
        categoryId: null,
      },
      {
        accountId: 'sys-expenses',
        systemRole: 'expenses',
        amount: usd(1250),
        categoryId: overrides.categoryId ?? null,
      },
    ],
    reversedById: null,
    ...overrides,
  } as TransactionView;
}

describe('dashboardEntries', () => {
  it('shows the note as the payee and the category beside it', () => {
    const [row] = dashboardEntries(
      [entry({ categoryId: 'c-food', note: 'Lunch' })],
      accounts,
      categories,
    );
    expect(row).toMatchObject({
      time: '12:30',
      payee: 'Lunch',
      category: 'Food',
    });
  });

  it('does not repeat the category when there is no note', () => {
    const [row] = dashboardEntries(
      [entry({ categoryId: 'c-food', occurredTime: null })],
      accounts,
      categories,
    );
    expect(row).toMatchObject({ time: null, payee: 'Food', category: null });
  });

  it('does not repeat the note when there is no category', () => {
    const [row] = dashboardEntries(
      [entry({ note: 'Market' })],
      accounts,
      categories,
    );
    expect(row).toMatchObject({ payee: 'Market', category: null });
  });
});

describe('an entry with no note and no category', () => {
  it('is named by its kind, as the ledger names it', () => {
    const [row] = dashboardEntries([entry({})], accounts, categories);
    expect(row).toMatchObject({ payee: 'Expense', category: null });
  });
});

describe('entryAmountKind', () => {
  const lent = entry({
    kind: 'transfer',
    postings: [
      {
        accountId: 'a-everyday',
        systemRole: null,
        amount: usd(-13400),
        categoryId: null,
      },
      {
        accountId: 'sys-receivables',
        systemRole: 'receivables',
        amount: usd(13400),
        categoryId: null,
      },
    ],
  });
  const moved = entry({
    kind: 'transfer',
    postings: [
      {
        accountId: 'a-everyday',
        systemRole: null,
        amount: usd(-5000),
        categoryId: null,
      },
      {
        accountId: 'a-savings',
        systemRole: null,
        amount: usd(5000),
        categoryId: null,
      },
    ],
  });
  const received = entry({
    kind: 'transfer',
    postings: [
      {
        accountId: 'a-everyday',
        systemRole: null,
        amount: usd(12000),
        categoryId: null,
      },
      {
        accountId: 'sys-receivables',
        systemRole: 'receivables',
        amount: usd(-12000),
        categoryId: null,
      },
    ],
  });

  it('draws a move between own accounts as a transfer', () => {
    const [row] = dashboardEntries([moved], accounts, categories);
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(entryAmountKind(row)).toBe('transfer');
    expect(row.amount).toEqual(usd(5000));
  });

  it('draws a lent or repaid IOU by its direction, with its amount', () => {
    const rows = dashboardEntries([lent, received], accounts, categories);
    expect(rows.map((r) => [entryAmountKind(r), r.amount])).toEqual([
      ['expense', usd(-13400)],
      ['income', usd(12000)],
    ]);
  });
});
