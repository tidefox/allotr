import { describe, expect, it } from 'vitest';
import type { AccountView } from '@allotr/shared';
import {
  defaultBillAccount,
  toBillBody,
  type BillDraft,
} from './bill-form-model.ts';

const account = (id: string, patch: Partial<AccountView> = {}) =>
  ({
    id,
    name: id,
    currency: 'USD',
    archived: false,
    budgetGroup: 'on',
    ...patch,
  }) as AccountView;

const accounts = [
  account('off', { budgetGroup: 'off' }),
  account('main'),
  account('old', { archived: true }),
];
const draft: BillDraft = {
  name: ' Rent ',
  accountId: 'main',
  amount: '120.50',
  dueDay: 5,
  categoryId: '',
  priceCurrency: '',
  price: '',
  active: true,
};

describe('toBillBody', () => {
  it('builds the body', () => {
    const result = toBillBody(draft, accounts, 'en');
    expect(result).toEqual({
      ok: true,
      price: null,
      body: {
        name: 'Rent',
        accountId: 'main',
        amount: { amountMinor: 12050, currency: 'USD' },
        dueDay: 5,
      },
    });
  });
  it('adds the category when chosen', () => {
    const result = toBillBody({ ...draft, categoryId: 'c1' }, accounts, 'en');
    expect(result.ok && result.body.categoryId).toBe('c1');
  });
  it('places errors next to fields', () => {
    const result = toBillBody(
      { ...draft, name: ' ', accountId: '', amount: '' },
      accounts,
      'en',
    );
    expect(result).toEqual({
      ok: false,
      errors: { name: 'required', accountId: 'account', amount: 'required' },
    });
  });
  it('refuses a zero amount', () => {
    const result = toBillBody({ ...draft, amount: '0' }, accounts, 'en');
    expect(result.ok).toBe(false);
  });
});

describe('defaultBillAccount', () => {
  it('prefers an open on-budget account', () => {
    expect(defaultBillAccount(accounts)).toBe('main');
  });
  it('is empty without accounts', () => {
    expect(defaultBillAccount([])).toBe('');
  });

  it('prices a bill in another currency', () => {
    const r = toBillBody(
      { ...draft, priceCurrency: 'EUR', price: '9.99' },
      accounts,
      'en',
    );
    expect(r.ok && r.price).toMatchObject({ amountMinor: 999 });
  });

  it('rejects a price in the account currency', () => {
    const r = toBillBody(
      { ...draft, priceCurrency: 'USD', price: '9.99' },
      accounts,
      'en',
    );
    expect(!r.ok && r.errors.price).toBe('same');
  });
});
