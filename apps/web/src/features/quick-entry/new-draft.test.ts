import type { AccountView, CategoryView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { isSplit } from './draft.ts';
import { draftForForm } from './new-draft.ts';

const account = (id: string, patch: Partial<AccountView> = {}) =>
  ({
    id,
    name: id,
    currency: 'USD',
    archived: false,
    budgetGroup: 'on',
    ...patch,
  }) as AccountView;

const defaults = {
  accounts: [
    account('a'),
    account('b'),
    account('c', { archived: true }),
    account('s', { budgetGroup: 'off' }),
  ],
  categories: [] as CategoryView[],
  today: '2026-10-11',
  lastUsed: {},
};

describe('draftForForm', () => {
  it('opens an expense on the first on-budget account', () => {
    const draft = draftForForm('expense', defaults);
    expect(draft).toMatchObject({ kind: 'expense', accountId: 'a' });
    expect(draft.occurredOn).toBe('2026-10-11');
  });

  it('uses the command line account for expenses and income', () => {
    expect(
      draftForForm('income', defaults, { intoAccountId: 'b' }).accountId,
    ).toBe('b');
    expect(
      draftForForm('expense', defaults, { intoAccountId: 'c' }).accountId,
    ).toBe('a');
  });

  it('presets a transfer source and keeps the target different', () => {
    const draft = draftForForm('transfer', defaults, { fromAccountId: 'b' });
    expect(draft).toMatchObject({
      kind: 'transfer',
      accountId: 'b',
      toAccountId: 'a',
    });
    const same = draftForForm('transfer', defaults, { fromAccountId: 'a' });
    expect(same.toAccountId).not.toBe('a');
    expect(same.toAccountId).not.toBe('');
  });

  it('ignores an archived source', () => {
    expect(
      draftForForm('transfer', defaults, { fromAccountId: 'c' }).accountId,
    ).toBe('a');
  });

  it('starts a split with people as a plain expense', () => {
    const draft = draftForForm('split', defaults);
    expect(isSplit(draft)).toBe(false);
    expect(draft.kind).toBe('expense');
  });
});
