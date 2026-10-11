import { money, type AccountView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { newAccountDraft, toCreateBody } from './create-draft.ts';
import { groupAccounts, transferTargets } from './groups.ts';

function account(
  id: string,
  currency: string,
  extra: Partial<Pick<AccountView, 'budgetGroup' | 'archived'>> = {},
): AccountView {
  return {
    id,
    name: id,
    kind: 'asset',
    currency,
    budgetGroup: 'on',
    balance: money(0, currency),
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    poolId: 'pool-budget',
    lastReconciledOn: null,
    ...extra,
  } as AccountView;
}

const draft = newAccountDraft('USD', '2026-03-15');

describe('toCreateBody', () => {
  it('sends only a name, currency and group without a balance', () => {
    expect(toCreateBody({ ...draft, name: '  Everyday  ' }, 'en-US')).toEqual({
      ok: true,
      body: {
        name: 'Everyday',
        currency: 'USD',
        kind: 'asset',
        budgetGroup: 'on',
      },
    });
  });

  it('parses the balance in the account currency and dates it', () => {
    expect(
      toCreateBody(
        {
          ...draft,
          name: 'Yen wallet',
          currency: 'JPY',
          budgetGroup: 'off',
          openingBalance: '12,000',
          openedOn: '2026-03-01',
        },
        'en-US',
      ),
    ).toEqual({
      ok: true,
      body: {
        name: 'Yen wallet',
        currency: 'JPY',
        kind: 'asset',
        budgetGroup: 'off',
        openingBalance: money(12_000, 'JPY'),
        openedOn: '2026-03-01',
      },
    });
  });

  it('adds a credit limit and due day for a credit account only', () => {
    const credit = {
      ...draft,
      name: 'Card',
      kind: 'liability' as const,
      creditLimit: '1,500.00',
      dueDay: '25',
    };
    expect(toCreateBody(credit, 'en-US')).toEqual({
      ok: true,
      body: {
        name: 'Card',
        currency: 'USD',
        kind: 'liability',
        budgetGroup: 'on',
        creditLimit: money(150_000, 'USD'),
        dueDay: 25,
      },
    });
    // Typed values are ignored when the type is switched back.
    const asset = toCreateBody({ ...credit, kind: 'asset' }, 'en-US');
    expect(asset.ok && 'creditLimit' in asset.body).toBe(false);
    expect(asset.ok && 'dueDay' in asset.body).toBe(false);
  });

  it('adds a minimum payment for a card and a subtype for any account', () => {
    const card = toCreateBody(
      {
        ...draft,
        name: 'Card',
        kind: 'liability',
        minPayment: '25',
        subtype: ' credit card ',
      },
      'en-US',
    );
    expect(card.ok && card.body).toMatchObject({
      minPayment: money(2_500, 'USD'),
      subtype: 'credit card',
    });
    const plain = toCreateBody(
      { ...draft, name: 'Wallet', minPayment: '25', subtype: 'cash' },
      'en-US',
    );
    expect(plain.ok && plain.body).toMatchObject({ subtype: 'cash' });
    expect(plain.ok && 'minPayment' in plain.body).toBe(false);
    expect(
      toCreateBody(
        { ...draft, name: 'Card', kind: 'liability', minPayment: '0' },
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: { minPayment: 'accounts.create.errors.paymentInvalid' },
    });
  });

  it('refuses a credit limit of zero and a due day out of range', () => {
    const credit = { ...draft, name: 'Card', kind: 'liability' as const };
    expect(
      toCreateBody({ ...credit, creditLimit: '0', dueDay: '32' }, 'en-US'),
    ).toEqual({
      ok: false,
      errors: {
        creditLimit: 'accounts.create.errors.limitInvalid',
        dueDay: 'accounts.create.errors.dayInvalid',
      },
    });
    expect(toCreateBody({ ...credit, creditLimit: 'abc' }, 'en-US').ok).toBe(
      false,
    );
  });

  it('takes a negative balance for a debt and the locale’s separators', () => {
    const result = toCreateBody(
      { ...draft, name: 'Card', currency: 'EUR', openingBalance: '-1.234,56' },
      'de-DE',
    );
    expect(result.ok && result.body.openingBalance).toEqual(
      money(-123_456, 'EUR'),
    );
  });

  it('leaves out a zero balance and its date', () => {
    expect(
      toCreateBody(
        { ...draft, name: 'Empty', openingBalance: '0', openedOn: '' },
        'en-US',
      ),
    ).toEqual({
      ok: true,
      body: {
        name: 'Empty',
        currency: 'USD',
        kind: 'asset',
        budgetGroup: 'on',
      },
    });
  });

  it('reports every invalid field', () => {
    expect(
      toCreateBody({ ...draft, openingBalance: '1.234' }, 'en-US'),
    ).toEqual({
      ok: false,
      errors: {
        name: 'accounts.create.errors.nameRequired',
        openingBalance: 'accounts.create.errors.balanceDecimals',
      },
    });
    expect(
      toCreateBody(
        { ...draft, name: 'x'.repeat(101), currency: 'ZZZ' },
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: {
        name: 'accounts.create.errors.nameLong',
        currency: 'accounts.create.errors.currencyRequired',
      },
    });
    expect(
      toCreateBody(
        { ...draft, name: 'A', openingBalance: 'lots', openedOn: '2026-02-30' },
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: { openingBalance: 'accounts.create.errors.balanceInvalid' },
    });
    expect(
      toCreateBody(
        { ...draft, name: 'A', openingBalance: '5', openedOn: '2026-02-30' },
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: { openedOn: 'accounts.create.errors.dateInvalid' },
    });
  });
});

describe('groupAccounts', () => {
  it('splits open accounts by today’s group and lists archived ones apart', () => {
    const everyday = account('everyday', 'USD');
    const savings = account('savings', 'USD', { budgetGroup: 'off' });
    const closed = account('closed', 'USD', {
      budgetGroup: 'off',
      archived: true,
    });
    expect(groupAccounts([everyday, closed, savings])).toEqual({
      on: [everyday],
      off: [savings],
      archived: [closed],
    });
  });
});

describe('transferTargets', () => {
  it('offers other open accounts in the same currency, in either group', () => {
    const from = account('from', 'USD');
    const savings = account('savings', 'USD', { budgetGroup: 'off' });
    const accounts = [
      from,
      savings,
      account('euros', 'EUR'),
      account('closed', 'USD', { archived: true }),
    ];
    expect(transferTargets(from, accounts)).toEqual([savings]);
  });
});
