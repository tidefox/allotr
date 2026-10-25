import {
  money,
  type AccountView,
  type CategoryView,
  type TransactionView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { entryRows } from './entries.ts';

// Made-up accounts, categories and entries.
const usd = (amountMinor: number) => money(amountMinor, 'USD');

const accounts = [
  { id: 'a-everyday', name: 'Everyday' },
  { id: 'a-savings', name: 'Savings' },
] as AccountView[];
const categories = [
  { id: 'c-food', name: 'Food', colour: 'series-6', icon: 'utensils' },
] as CategoryView[];

function entry(overrides: Partial<TransactionView>): TransactionView {
  return {
    id: 'e-1',
    kind: 'expense',
    occurredOn: '2026-03-11',
    occurredTime: null,
    createdAt: '2026-03-11T09:00:00.000Z',
    sortRank: 'V',
    source: 'api',
    categoryId: null,
    note: null,
    postings: [],
    reversesId: null,
    reversedById: null,
    restoredById: null,
    replacesId: null,
    replacedById: null,
    impliedRate: null,
    budgetSwitch: null,
    tagIds: [],
    ...overrides,
  } as TransactionView;
}

const posting = (accountId: string, amountMinor: number) => ({
  accountId,
  systemRole: null,
  amount: usd(amountMinor),
  categoryId: null,
});
const balancing = (amountMinor: number) => ({
  accountId: 'sys-expenses',
  systemRole: 'expenses' as const,
  amount: usd(amountMinor),
  categoryId: 'c-food',
});

describe('entryRows', () => {
  it('names an expense by category and signs it from the user’s side', () => {
    const rows = entryRows(
      [
        entry({
          categoryId: 'c-food',
          note: 'Lunch',
          postings: [posting('a-everyday', -1250), balancing(1250)],
        }),
      ],
      accounts,
      categories,
    );
    expect(rows).toEqual([
      {
        id: 'e-1',
        kind: 'expense',
        title: 'Food',
        note: 'Lunch',
        accounts: ['Everyday'],
        amount: usd(-1250),
        moves: false,
        style: { colour: 'series-6', icon: 'utensils' },
      },
    ]);
  });

  it('shows a transfer from and to, with the amount sent', () => {
    const [row] = entryRows(
      [
        entry({
          kind: 'transfer',
          postings: [
            posting('a-savings', 30000),
            posting('a-everyday', -30000),
          ],
        }),
      ],
      accounts,
      categories,
    );
    expect(row).toMatchObject({
      title: null,
      accounts: ['Everyday', 'Savings'],
      amount: usd(30000),
      moves: true,
    });
  });

  it('signs a transfer with one own side, such as an IOU, as out or in', () => {
    // Lending money moves it out of an account into a receivable.
    const lent = entry({
      id: 'e-lend',
      kind: 'transfer',
      postings: [
        posting('a-everyday', -13400),
        {
          accountId: 'sys-receivables',
          systemRole: 'receivables' as const,
          amount: usd(13400),
          categoryId: null,
        },
      ],
    });
    // A repayment moves it back in.
    const repaid = entry({
      id: 'e-repay',
      kind: 'transfer',
      postings: [
        posting('a-everyday', 12000),
        {
          accountId: 'sys-receivables',
          systemRole: 'receivables' as const,
          amount: usd(-12000),
          categoryId: null,
        },
      ],
    });
    const rows = entryRows([lent, repaid], accounts, categories);
    expect(rows.map((r) => [r.moves, r.amount])).toEqual([
      [false, usd(-13400)],
      [false, usd(12000)],
    ]);
  });

  it('leaves out a deleted entry, its undo and budget switches', () => {
    const rows = entryRows(
      [
        entry({ id: 'e-2', kind: 'reversal', reversesId: 'e-1' }),
        entry({
          reversedById: 'e-2',
          postings: [posting('a-everyday', -500), balancing(500)],
        }),
        entry({
          id: 'e-4',
          postings: [posting('a-everyday', -700), balancing(700)],
        }),
        entry({
          id: 'e-3',
          kind: 'budget_switch',
          budgetSwitch: { accountId: 'a-savings', budgetGroup: 'on' },
        }),
      ],
      accounts,
      categories,
    );
    expect(rows.map((r) => r.id)).toEqual(['e-4']);
  });
});
