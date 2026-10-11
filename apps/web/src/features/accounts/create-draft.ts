import {
  isCurrencyCode,
  localDateSchema,
  MoneyError,
  parseMoney,
  type AccountView,
  type CreateAccountBody,
} from '@allotr/shared';
import type { MessageKey } from '@/messages/t';

// The create-account form's state and its translation into an API request
// (FR-L2). The currency is fixed once the account exists. The server still
// validates everything.

export interface AccountDraft {
  readonly name: string;
  readonly currency: string;
  readonly budgetGroup: AccountView['budgetGroup'];
  /** What can be added here: money you hold, or a credit account. */
  readonly kind: CreatableKind;
  /** Credit only: as typed, in `currency`; empty for none. */
  readonly creditLimit: string;
  /** Credit only: 1 to 31 as typed; empty for none. */
  readonly dueDay: string;
  /** As typed, in `currency`; empty for none, negative for a debt. */
  readonly openingBalance: string;
  /** YYYY-MM-DD; the day the opening balance counts from. */
  readonly openedOn: string;
}

/** Receivable and payable accounts belong to IOUs and are made there. */
export type CreatableKind = Extract<AccountView['kind'], 'asset' | 'liability'>;

export type AccountDraftField = Exclude<
  keyof AccountDraft,
  'budgetGroup' | 'kind'
>;
export type AccountDraftErrorKey = Extract<
  MessageKey,
  `accounts.create.errors.${string}`
>;
export type AccountDraftErrors = Partial<
  Record<AccountDraftField, AccountDraftErrorKey>
>;

/** Fields in form order, for moving focus to the first invalid one. */
export const ACCOUNT_FIELD_ORDER: readonly AccountDraftField[] = [
  'name',
  'currency',
  'creditLimit',
  'dueDay',
  'openingBalance',
  'openedOn',
];

export function newAccountDraft(
  defaultCurrency: string,
  today: string,
): AccountDraft {
  return {
    name: '',
    currency: defaultCurrency,
    budgetGroup: 'on',
    kind: 'asset',
    creditLimit: '',
    dueDay: '',
    openingBalance: '',
    openedOn: today,
  };
}

export type AccountDraftResult =
  | { readonly ok: true; readonly body: CreateAccountBody }
  | { readonly ok: false; readonly errors: AccountDraftErrors };

export function toCreateBody(
  draft: AccountDraft,
  locale: string,
): AccountDraftResult {
  const errors: AccountDraftErrors = {};
  const name = draft.name.trim();
  if (name === '') errors.name = 'accounts.create.errors.nameRequired';
  else if (name.length > 100) errors.name = 'accounts.create.errors.nameLong';

  const currency = isCurrencyCode(draft.currency) ? draft.currency : undefined;
  if (currency === undefined)
    errors.currency = 'accounts.create.errors.currencyRequired';

  let openingBalance: CreateAccountBody['openingBalance'];
  if (currency !== undefined && draft.openingBalance.trim() !== '') {
    try {
      const amount = parseMoney(draft.openingBalance, currency, locale);
      if (amount.amountMinor !== 0) openingBalance = amount;
    } catch (error) {
      if (!(error instanceof MoneyError)) throw error;
      errors.openingBalance =
        error.code === 'money.too_many_decimals'
          ? 'accounts.create.errors.balanceDecimals'
          : 'accounts.create.errors.balanceInvalid';
    }
  }

  // A limit and a due day belong to credit accounts, and both are optional.
  let creditLimit: CreateAccountBody['creditLimit'];
  let dueDay: number | undefined;
  if (draft.kind === 'liability') {
    const typedLimit = draft.creditLimit.trim();
    if (currency !== undefined && typedLimit !== '') {
      try {
        const limit = parseMoney(typedLimit, currency, locale);
        if (limit.amountMinor <= 0)
          errors.creditLimit = 'accounts.create.errors.limitInvalid';
        else creditLimit = limit;
      } catch (error) {
        if (!(error instanceof MoneyError)) throw error;
        errors.creditLimit = 'accounts.create.errors.limitInvalid';
      }
    }
    const typedDay = draft.dueDay.trim();
    if (typedDay !== '') {
      const day = /^\d{1,2}$/.test(typedDay) ? Number(typedDay) : Number.NaN;
      if (day >= 1 && day <= 31) dueDay = day;
      else errors.dueDay = 'accounts.create.errors.dayInvalid';
    }
  }

  // The date only matters with a balance to date.
  const openedOn =
    openingBalance === undefined
      ? undefined
      : localDateSchema.safeParse(draft.openedOn);
  if (openedOn?.success === false)
    errors.openedOn = 'accounts.create.errors.dateInvalid';

  if (Object.keys(errors).length > 0 || currency === undefined)
    return { ok: false, errors };
  return {
    ok: true,
    body: {
      name,
      currency,
      kind: draft.kind,
      budgetGroup: draft.budgetGroup,
      ...(creditLimit === undefined ? {} : { creditLimit }),
      ...(dueDay === undefined ? {} : { dueDay }),
      ...(openingBalance === undefined ? {} : { openingBalance }),
      ...(openedOn?.success === true ? { openedOn: openedOn.data } : {}),
    },
  };
}
