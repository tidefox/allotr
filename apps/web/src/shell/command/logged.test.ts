import {
  money,
  type AccountView,
  type CategoryView,
  type TransactionView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { loggedFromTransaction } from './logged.ts';

// Made-up accounts, categories and entries.
const accounts = [
  { id: 'a-everyday', name: 'Everyday' },
  { id: 'a-savings', name: 'Savings' },
] as AccountView[];
const categories = [
  { id: 'c-food', name: 'Food' },
  { id: 'c-fun', name: 'Fun' },
] as CategoryView[];

const posting = (
  accountId: string,
  amountMinor: number,
  categoryId = null,
) => ({
  accountId,
  systemRole: null,
  amount: money(amountMinor, 'USD'),
  categoryId,
});

function entry(patch: Partial<TransactionView>): TransactionView {
  return {
    id: 'e-1',
    kind: 'expense',
    categoryId: null,
    postings: [],
    reversesId: null,
    reversedById: null,
    replacesId: null,
    budgetSwitch: null,
    ...patch,
  } as TransactionView;
}

describe('loggedFromTransaction', () => {
  it('reads an expense from the server entry', () => {
    const logged = loggedFromTransaction(
      entry({
        categoryId: 'c-food',
        postings: [
          posting('a-everyday', -1250),
          { ...posting('x', 1250), systemRole: 'expenses' },
        ],
      }),
      accounts,
      categories,
    );
    expect(logged).toEqual({
      id: 'e-1',
      amount: money(-1250, 'USD'),
      kind: 'expense',
      accountName: 'Everyday',
      categoryLabel: 'Food',
    });
  });

  it('names both accounts of a transfer', () => {
    const logged = loggedFromTransaction(
      entry({
        kind: 'transfer',
        postings: [posting('a-everyday', -5000), posting('a-savings', 5000)],
      }),
      accounts,
      categories,
    );
    expect(logged?.accountName).toBe('Everyday → Savings');
    expect(logged?.amount.amountMinor).toBe(5000);
    expect(logged?.categoryLabel).toBeNull();
  });

  it('shows a split by its categories', () => {
    const logged = loggedFromTransaction(
      entry({
        postings: [
          posting('a-everyday', -3000),
          {
            ...posting('x', 1000),
            systemRole: 'expenses',
            categoryId: 'c-food',
          },
          {
            ...posting('x', 2000),
            systemRole: 'expenses',
            categoryId: 'c-fun',
          },
        ] as never,
      }),
      accounts,
      categories,
    );
    expect(logged?.categoryLabel).toContain('Food');
    expect(logged?.categoryLabel).toContain('Fun');
  });

  it('skips kinds the result line does not show', () => {
    expect(
      loggedFromTransaction(entry({ kind: 'opening' }), accounts, categories),
    ).toBeNull();
  });
});
