import type { AccountView, CreateBillBody } from '@allotr/shared';
import {
  parseBillAmount,
  type AmountError,
} from '@/features/settings/bill-draft.ts';

// The create-bill sheet's text turned into the API body. The server still
// validates everything; this only places errors next to fields.

export interface BillDraft {
  readonly name: string;
  readonly accountId: string;
  /** As typed, in the paying account's currency. */
  readonly amount: string;
  /** Day of the month, 1-31. */
  readonly dueDay: number;
  /** An expense category id, or empty for none. */
  readonly categoryId: string;
}

export type BillField = 'name' | 'accountId' | 'amount';
export type BillErrors = Partial<
  Record<BillField, 'required' | 'account' | AmountError>
>;

export type BillResult =
  { ok: true; body: CreateBillBody } | { ok: false; errors: BillErrors };

/** The days of a month a bill can fall on. */
export const DUE_DAYS: readonly number[] = Array.from(
  { length: 31 },
  (_, i) => i + 1,
);

/** The account a new bill starts on: the first open on-budget one. */
export function defaultBillAccount(accounts: readonly AccountView[]): string {
  return (
    accounts.find((a) => !a.archived && a.budgetGroup === 'on')?.id ??
    accounts.find((a) => !a.archived)?.id ??
    ''
  );
}

export function toBillBody(
  draft: BillDraft,
  accounts: readonly AccountView[],
  locale: string,
): BillResult {
  const errors: BillErrors = {};
  const name = draft.name.trim();
  if (name === '') errors.name = 'required';
  const account = accounts.find((a) => a.id === draft.accountId);
  if (account === undefined) errors.accountId = 'account';
  const amount = parseBillAmount(draft.amount, account?.currency ?? '', locale);
  if (!amount.ok) errors.amount = amount.error;
  if (!amount.ok || account === undefined || Object.keys(errors).length > 0)
    return { ok: false, errors };
  return {
    ok: true,
    body: {
      name,
      accountId: account.id,
      amount: amount.amount,
      ...(draft.categoryId === '' ? {} : { categoryId: draft.categoryId }),
      dueDay: draft.dueDay,
    },
  };
}
