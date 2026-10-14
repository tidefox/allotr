import {
  linkRefusalCodes,
  money,
  type WithdrawalLinkView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { errorCodeMessage, t } from '@/messages/t';
import {
  candidateTitle,
  canTakeLinks,
  isLinkRefusal,
  linkBody,
  linkRoleOf,
  otherEntryId,
  sectionRole,
  showsLinks,
} from './withdrawal-link-model.ts';

const link = (over: Partial<WithdrawalLinkView> = {}): WithdrawalLinkView => ({
  id: 'l1',
  withdrawalId: 'w1',
  expenseId: 'e1',
  amount: money(30_000, 'USD'),
  valid: true,
  reason: null,
  ...over,
});

describe('linkRoleOf', () => {
  it('reads which end of its links the entry is', () => {
    expect(linkRoleOf({ id: 'e1', withdrawalLinks: [link()] })).toBe('expense');
    expect(linkRoleOf({ id: 'w1', withdrawalLinks: [link()] })).toBe(
      'withdrawal',
    );
    expect(linkRoleOf({ id: 'x', withdrawalLinks: [link()] })).toBeNull();
    expect(linkRoleOf({ id: 'e1', withdrawalLinks: [] })).toBeNull();
  });

  it('can skip links that do not count', () => {
    const entry = {
      id: 'e1',
      withdrawalLinks: [link({ valid: false, reason: 'withdrawal_undone' })],
    };
    expect(linkRoleOf(entry)).toBe('expense');
    expect(linkRoleOf(entry, true)).toBeNull();
  });
});

describe('otherEntryId', () => {
  it('names the entry at the other end', () => {
    expect(otherEntryId(link(), 'e1')).toBe('w1');
    expect(otherEntryId(link(), 'w1')).toBe('e1');
  });
});

describe('canTakeLinks', () => {
  const live = { reversedById: null, replacedById: null };
  it('allows live expenses and transfers only', () => {
    expect(canTakeLinks({ kind: 'expense', ...live })).toBe(true);
    expect(canTakeLinks({ kind: 'transfer', ...live })).toBe(true);
    expect(canTakeLinks({ kind: 'income', ...live })).toBe(false);
    expect(
      canTakeLinks({ kind: 'expense', reversedById: 'r', replacedById: null }),
    ).toBe(false);
    expect(
      canTakeLinks({ kind: 'expense', reversedById: null, replacedById: 'n' }),
    ).toBe(false);
  });
});

describe('showsLinks and sectionRole', () => {
  const bare = { id: 'e1', withdrawalLinks: [] };
  it('hides the section for no links and no role', () => {
    expect(showsLinks(bare, 'none')).toBe(false);
    expect(showsLinks(bare, undefined)).toBe(false);
  });
  it('shows it for a role, or for links that exist', () => {
    expect(showsLinks(bare, 'expense')).toBe(true);
    expect(showsLinks({ withdrawalLinks: [link()] }, 'none')).toBe(true);
  });
  it('prefers the server role, else reads the links', () => {
    expect(sectionRole(bare, 'withdrawal')).toBe('withdrawal');
    expect(sectionRole({ id: 'w1', withdrawalLinks: [link()] }, 'none')).toBe(
      'withdrawal',
    );
  });
});

describe('messages', () => {
  it('has a refusal message and a not-counting reason for every code', () => {
    for (const code of linkRefusalCodes) {
      expect(isLinkRefusal(code)).toBe(true);
      expect(errorCodeMessage(code), code).toBeTypeOf('string');
      expect(t(`withdrawalLinks.reasons.${code}`), code).not.toBe('');
    }
    expect(isLinkRefusal('nope')).toBe(false);
  });
});

describe('candidateTitle', () => {
  it('joins the note and the accounts, or falls back', () => {
    expect(
      candidateTitle({ note: 'Fridge', accounts: ['Everyday'] }, '-'),
    ).toBe('Fridge · Everyday');
    expect(
      candidateTitle({ note: null, accounts: ['Savings', 'Everyday'] }, '-'),
    ).toBe('Savings → Everyday');
    expect(candidateTitle({ note: '', accounts: [] }, 'no note')).toBe(
      'no note',
    );
  });
});

describe('linkBody', () => {
  const amount = money(30_000, 'USD');
  it('puts the entry at the end it plays', () => {
    expect(linkBody('expense', 'e1', 'w1', amount)).toEqual({
      withdrawalId: 'w1',
      expenseId: 'e1',
      amount,
    });
    expect(linkBody('withdrawal', 'w1', 'e1', amount)).toEqual({
      withdrawalId: 'w1',
      expenseId: 'e1',
      amount,
    });
  });
});
