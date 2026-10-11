import { describe, expect, it } from 'vitest';
import {
  searchOf,
  validateTransactionsSearch,
  viewOf,
} from './search-params.ts';

describe('validateTransactionsSearch', () => {
  it('keeps valid values and drops the defaults', () => {
    expect(
      validateTransactionsSearch({
        q: '  coffee ',
        period: 'month',
        type: 'expense',
        categories: ['c1', 'c2', 'c1'],
        accounts: 'a1,a2',
        group: 'category',
        entry: 'e1',
      }),
    ).toEqual({
      q: 'coffee',
      period: 'month',
      type: 'expense',
      categories: ['c1', 'c2'],
      accounts: ['a1', 'a2'],
      group: 'category',
      entry: 'e1',
    });
    const plain = validateTransactionsSearch({ period: 'cycle', group: 'day' });
    expect(plain.period).toBeUndefined();
    expect(plain.group).toBeUndefined();
  });

  it('drops anything malformed', () => {
    expect(
      validateTransactionsSearch({
        q: 5,
        period: 'decade',
        type: 'loan',
        categories: [1, {}, ''],
        accounts: 7,
        group: 'week',
        entry: '',
      }),
    ).toEqual({
      q: undefined,
      period: undefined,
      type: undefined,
      categories: undefined,
      accounts: undefined,
      group: undefined,
      entry: undefined,
    });
  });

  it('caps a list at 50 ids', () => {
    const many = Array.from({ length: 80 }, (_, i) => `id${String(i)}`);
    expect(
      validateTransactionsSearch({ accounts: many }).accounts,
    ).toHaveLength(50);
  });
});

describe('viewOf and searchOf', () => {
  it('fill in and strip the defaults', () => {
    expect(viewOf({})).toMatchObject({
      period: 'cycle',
      group: 'day',
      categories: [],
      accounts: [],
    });
    expect(searchOf({ period: 'cycle', group: 'day', categories: [] })).toEqual(
      {
        q: undefined,
        period: undefined,
        type: undefined,
        categories: undefined,
        accounts: undefined,
        group: undefined,
        entry: undefined,
      },
    );
    expect(searchOf({ period: 'all', accounts: ['a1'] })).toMatchObject({
      period: 'all',
      accounts: ['a1'],
    });
  });
});

describe('payee', () => {
  it('is kept as the report names it and dropped when empty or not text', () => {
    expect(validateTransactionsSearch({ payee: '  Corner Cafe ' }).payee).toBe(
      'Corner Cafe',
    );
    expect(validateTransactionsSearch({ payee: '  ' }).payee).toBeUndefined();
    expect(validateTransactionsSearch({ payee: 4 }).payee).toBeUndefined();
  });
  it('round-trips through the view', () => {
    const search = validateTransactionsSearch({ payee: 'Corner Cafe' });
    expect(searchOf(viewOf(search)).payee).toBe('Corner Cafe');
  });
});

describe('sort', () => {
  it('keeps the four orders, leaving the default out of the address', () => {
    for (const sort of ['date-asc', 'amount-desc', 'amount-asc'] as const) {
      expect(validateTransactionsSearch({ sort }).sort).toBe(sort);
    }
    expect(validateTransactionsSearch({ sort: 'date-desc' }).sort).toBe(
      undefined,
    );
    expect(validateTransactionsSearch({ sort: 'size' }).sort).toBeUndefined();
    expect(validateTransactionsSearch({ sort: 3 }).sort).toBeUndefined();
  });
  it('round-trips through the view', () => {
    expect(viewOf({}).sort).toBe('date-desc');
    expect(searchOf(viewOf({ sort: 'amount-asc' })).sort).toBe('amount-asc');
    expect(searchOf({ sort: 'date-desc' }).sort).toBeUndefined();
  });
});
