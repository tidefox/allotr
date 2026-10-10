import { describe, expect, it } from 'vitest';
import type { BudgetView } from '@allotr/shared';
import { previewRequest } from './cover-order-model.ts';

describe('previewRequest', () => {
  const budget = {
    target: { kind: 'category', categoryId: 'cat' },
  } as BudgetView;

  it('is null until a budget, account and positive amount are given', () => {
    const base = { budget, accountId: 'acc', currency: 'USD', amount: '12.50' };
    expect(previewRequest({ ...base, budget: undefined })).toBeNull();
    expect(previewRequest({ ...base, accountId: '' })).toBeNull();
    expect(previewRequest({ ...base, amount: '' })).toBeNull();
    expect(previewRequest({ ...base, amount: 'abc' })).toBeNull();
    expect(previewRequest({ ...base, amount: '0' })).toBeNull();
    expect(
      previewRequest({
        ...base,
        budget: { target: { kind: 'buffer' } } as BudgetView,
      }),
    ).toBeNull();
  });

  it('parses the amount into minor units', () => {
    expect(
      previewRequest({
        budget,
        accountId: 'acc',
        currency: 'USD',
        amount: '12.50',
      }),
    ).toEqual({
      accountId: 'acc',
      categoryId: 'cat',
      amount: { amountMinor: 1250, currency: 'USD' },
    });
  });
});
