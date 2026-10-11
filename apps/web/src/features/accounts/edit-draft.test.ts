import { currencyCode, money, type AccountView } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { accountEditDraft, toUpdateBody } from './edit-draft';

function account(over: Partial<AccountView> = {}): AccountView {
  return {
    id: 'a',
    name: 'Everyday',
    kind: 'asset',
    currency: currencyCode('USD'),
    budgetGroup: 'on',
    poolId: 'p',
    balance: money(0, 'USD'),
    archived: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    colour: null,
    icon: null,
    creditLimit: null,
    creditAvailable: null,
    dueDay: null,
    minPayment: null,
    subtype: null,
    nextDueOn: null,
    lastReconciledOn: null,
    reconcileDue: false,
    ...over,
  };
}

const card = account({
  kind: 'liability',
  creditLimit: money(200_000, 'USD'),
  creditAvailable: money(160_000, 'USD'),
  dueDay: 15,
});

describe('accountEditDraft', () => {
  it('starts from the account, the limit as typed money', () => {
    expect(accountEditDraft(card, 'en-US')).toEqual({
      name: 'Everyday',
      colour: null,
      icon: null,
      creditLimit: '2000.00',
      dueDay: '15',
      minPayment: '',
      subtype: '',
    });
  });
});

describe('toUpdateBody', () => {
  const same = (a: AccountView) => accountEditDraft(a, 'en-US');

  it('sends nothing when nothing changed', () => {
    expect(toUpdateBody(same(card), card, 'en-US')).toEqual({
      ok: true,
      body: {},
    });
  });

  it('sends only what changed, with null clearing', () => {
    const draft = {
      ...same(card),
      name: ' Travel card ',
      colour: 'series-4' as const,
      icon: 'plane' as const,
      creditLimit: '',
      dueDay: '31',
    };
    expect(toUpdateBody(draft, card, 'en-US')).toEqual({
      ok: true,
      body: {
        name: 'Travel card',
        colour: 'series-4',
        icon: 'plane',
        creditLimit: null,
        dueDay: 31,
      },
    });
  });

  it('parses the limit in the account currency, 0 digits included', () => {
    const yen = { ...card, currency: currencyCode('JPY'), creditLimit: null };
    const draft = { ...same(yen), creditLimit: '500000' };
    expect(toUpdateBody(draft, yen, 'en-US')).toEqual({
      ok: true,
      body: { creditLimit: money(500_000, 'JPY') },
    });
  });

  it('refuses a limit that is zero, negative or not an amount', () => {
    for (const creditLimit of ['0', '-5', 'lots', '1.234']) {
      const result = toUpdateBody(
        { ...same(card), creditLimit },
        card,
        'en-US',
      );
      expect(result).toMatchObject({
        ok: false,
        errors: { creditLimit: 'accountsScreen.edit.errors.limitInvalid' },
      });
    }
  });

  it('accepts a due day from 1 to 31 and nothing else (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 50 }), (n) => {
        const result = toUpdateBody(
          { ...same(card), dueDay: String(n) },
          card,
          'en-US',
        );
        expect(result.ok).toBe(n >= 1 && n <= 31);
      }),
    );
    for (const dueDay of ['abc', '1.5', '007', ' ']) {
      if (dueDay.trim() === '') continue;
      expect(toUpdateBody({ ...same(card), dueDay }, card, 'en-US').ok).toBe(
        false,
      );
    }
  });

  it('leaves credit fields alone on other kinds', () => {
    const asset = account();
    const draft = { ...same(asset), creditLimit: '100', dueDay: '3' };
    expect(toUpdateBody(draft, asset, 'en-US')).toEqual({ ok: true, body: {} });
  });

  it('sets and clears a minimum payment on a card, in its currency', () => {
    expect(
      toUpdateBody({ ...same(card), minPayment: '25' }, card, 'en-US'),
    ).toEqual({ ok: true, body: { minPayment: money(2_500, 'USD') } });
    const paying = { ...card, minPayment: money(2_500, 'USD') };
    expect(
      toUpdateBody({ ...same(paying), minPayment: '' }, paying, 'en-US'),
    ).toEqual({ ok: true, body: { minPayment: null } });
    for (const minPayment of ['0', '-5', 'abc']) {
      expect(
        toUpdateBody({ ...same(card), minPayment }, card, 'en-US'),
      ).toEqual({
        ok: false,
        errors: { minPayment: 'accountsScreen.edit.errors.paymentInvalid' },
      });
    }
  });

  it('trims the subtype, clears it when emptied and caps its length', () => {
    expect(
      toUpdateBody({ ...same(card), subtype: '  debit card ' }, card, 'en-US'),
    ).toEqual({ ok: true, body: { subtype: 'debit card' } });
    const labelled = { ...card, subtype: 'debit card' };
    expect(
      toUpdateBody({ ...same(labelled), subtype: '  ' }, labelled, 'en-US'),
    ).toEqual({ ok: true, body: { subtype: null } });
    expect(
      toUpdateBody({ ...same(card), subtype: 'x'.repeat(101) }, card, 'en-US'),
    ).toEqual({
      ok: false,
      errors: { subtype: 'accountsScreen.edit.errors.subtypeLong' },
    });
    // A subtype belongs to every kind of account.
    const asset = account({});
    expect(
      toUpdateBody({ ...same(asset), subtype: 'wallet' }, asset, 'en-US'),
    ).toEqual({ ok: true, body: { subtype: 'wallet' } });
  });

  it('refuses an empty or long name', () => {
    expect(
      toUpdateBody({ ...same(card), name: '  ' }, card, 'en-US'),
    ).toMatchObject({
      ok: false,
      errors: { name: 'accountsScreen.rename.nameRequired' },
    });
    expect(
      toUpdateBody({ ...same(card), name: 'x'.repeat(101) }, card, 'en-US'),
    ).toMatchObject({
      ok: false,
      errors: { name: 'accountsScreen.rename.nameLong' },
    });
  });
});
