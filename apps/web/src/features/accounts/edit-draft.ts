import {
  formatMoneyInput,
  MoneyError,
  parseMoney,
  type AccountView,
  type CategoryColour,
  type CategoryIcon,
  type Money,
} from '@allotr/shared';
import type { MessageKey } from '@/messages/t';

// The edit-account form's state and its translation into a request: the
// name, how the account looks and, for a credit account, its limit and due
// day (display only; docs/domain.md "Credit limit and due day"). Only what
// changed is sent. The server validates everything again.

export interface AccountEditDraft {
  readonly name: string;
  readonly colour: CategoryColour | null;
  readonly icon: CategoryIcon | null;
  /** As typed, in the account's currency; empty for none. */
  readonly creditLimit: string;
  /** 1 to 31 as typed; empty for none. */
  readonly dueDay: string;
}

export type AccountEditField = 'name' | 'creditLimit' | 'dueDay';
export type AccountEditErrors = Partial<
  Record<
    AccountEditField,
    Extract<
      MessageKey,
      | `accountsScreen.edit.errors.${string}`
      | 'accountsScreen.rename.nameRequired'
      | 'accountsScreen.rename.nameLong'
    >
  >
>;

export interface AccountUpdate {
  name?: string;
  colour?: CategoryColour | null;
  icon?: CategoryIcon | null;
  creditLimit?: Money | null;
  dueDay?: number | null;
}

export function accountEditDraft(
  account: AccountView,
  locale: string,
): AccountEditDraft {
  return {
    name: account.name,
    colour: account.colour,
    icon: account.icon,
    creditLimit:
      account.creditLimit === null
        ? ''
        : formatMoneyInput(account.creditLimit, locale),
    dueDay: account.dueDay === null ? '' : String(account.dueDay),
  };
}

export type AccountEditResult =
  | { readonly ok: true; readonly body: AccountUpdate }
  | { readonly ok: false; readonly errors: AccountEditErrors };

/** The changes between the account and the draft; empty when there are none. */
export function toUpdateBody(
  draft: AccountEditDraft,
  account: AccountView,
  locale: string,
): AccountEditResult {
  const errors: AccountEditErrors = {};
  const body: AccountUpdate = {};

  const name = draft.name.trim();
  if (name === '') errors.name = 'accountsScreen.rename.nameRequired';
  else if (name.length > 100) errors.name = 'accountsScreen.rename.nameLong';
  else if (name !== account.name) body.name = name;

  if (draft.colour !== account.colour) body.colour = draft.colour;
  if (draft.icon !== account.icon) body.icon = draft.icon;

  if (account.kind === 'liability') {
    const typedLimit = draft.creditLimit.trim();
    if (typedLimit === '') {
      if (account.creditLimit !== null) body.creditLimit = null;
    } else {
      try {
        const limit = parseMoney(typedLimit, account.currency, locale);
        if (limit.amountMinor <= 0)
          errors.creditLimit = 'accountsScreen.edit.errors.limitInvalid';
        else if (limit.amountMinor !== account.creditLimit?.amountMinor)
          body.creditLimit = limit;
      } catch (error) {
        if (!(error instanceof MoneyError)) throw error;
        errors.creditLimit = 'accountsScreen.edit.errors.limitInvalid';
      }
    }

    const typedDay = draft.dueDay.trim();
    if (typedDay === '') {
      if (account.dueDay !== null) body.dueDay = null;
    } else {
      const day = /^\d{1,2}$/.test(typedDay) ? Number(typedDay) : Number.NaN;
      if (!(day >= 1 && day <= 31))
        errors.dueDay = 'accountsScreen.edit.errors.dayInvalid';
      else if (day !== account.dueDay) body.dueDay = day;
    }
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, body };
}
