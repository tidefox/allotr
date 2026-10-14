import {
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { reversedIds } from '../ledger/indexes.ts';
import type {
  AccountId,
  BudgetGroup,
  Posting,
  Transaction,
  TransactionId,
} from '../ledger/types.ts';
import { outsideEntries } from './funding.ts';
import { groupsOn } from './pools.ts';
import type { LedgerView } from './types.ts';

// Withdrawal links (ADR 0038, docs/domain.md "Withdrawal links"): a link ties
// part of a savings withdrawal to an expense it paid for. It is a setting on
// two entries and never changes their postings. Everything built on the
// budget reads the ledger through `budgetView`, which rewrites each valid
// link as if the expense had paid that amount straight from the savings
// account; balances, net worth, history, reconciliation and exports keep
// reading the real ledger.

declare const brand: unique symbol;
export type WithdrawalLinkId = string & {
  readonly [brand]: 'WithdrawalLinkId';
};
export const withdrawalLinkId = (id: string) => id as WithdrawalLinkId;

export type WithdrawalLink = Readonly<{
  id: WithdrawalLinkId;
  withdrawalId: TransactionId;
  expenseId: TransactionId;
  /** Positive, in the currency of the withdrawal's inbound side. */
  amount: Money;
}>;

/** Why a link does not count; stable codes the API maps to messages. */
export type LinkRefusal =
  | 'withdrawal_missing'
  | 'withdrawal_undone'
  | 'withdrawal_not_transfer'
  | 'withdrawal_not_from_savings'
  | 'expense_missing'
  | 'expense_undone'
  | 'expense_not_expense'
  | 'expense_outside_funded'
  | 'expense_bill_payment'
  | 'expense_not_on_budget'
  | 'amount_not_positive'
  | 'currency_mismatch'
  | 'withdrawal_exceeded'
  | 'expense_exceeded';

export type DroppedLink = Readonly<{
  link: WithdrawalLink;
  reason: LinkRefusal;
}>;

export type LinkValidity = Readonly<{
  /** The links that count, ordered by id. */
  valid: readonly WithdrawalLink[];
  /** The links that do not, ordered by id, each with its reason. */
  dropped: readonly DroppedLink[];
}>;

const byId = (a: WithdrawalLink, b: WithdrawalLink) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

type Context = Readonly<{
  entries: ReadonlyMap<TransactionId, Transaction>;
  reversed: ReadonlySet<TransactionId>;
  outside: ReadonlySet<TransactionId>;
  billPayments: ReadonlySet<TransactionId>;
  groups: (date: LocalDate) => ReadonlyMap<AccountId, BudgetGroup>;
  isRole: (id: AccountId, role: string) => boolean;
}>;

function contextOf(view: LedgerView): Context {
  const entries = new Map(view.ledger.map((t) => [t.id, t] as const));
  const billPayments = new Set<TransactionId>();
  for (const bill of view.bills) {
    for (const payment of bill.payments) {
      if (payment.transactionId != null)
        billPayments.add(payment.transactionId);
    }
  }
  const memo = new Map<LocalDate, ReadonlyMap<AccountId, BudgetGroup>>();
  return {
    entries,
    reversed: reversedIds(view.ledger),
    outside: outsideEntries(view),
    billPayments,
    groups: (date) => {
      let found = memo.get(date);
      if (found === undefined) {
        found = groupsOn(view, date);
        memo.set(date, found);
      }
      return found;
    },
    isRole: (id, role) => view.chart.get(id)?.systemRole === role,
  };
}

// What a withdrawal moved from off-budget to on-budget in `currency`, and
// whether it has the two sides at all.
function withdrawalSides(
  entry: Transaction,
  groups: ReadonlyMap<AccountId, BudgetGroup>,
  currency: CurrencyCode,
): Readonly<{ leaves: boolean; enters: boolean; moved: number }> {
  let out = 0;
  let into = 0;
  let leaves = false;
  let enters = false;
  for (const p of entry.postings) {
    const group = groups.get(p.accountId);
    if (group === 'off' && p.amount.amountMinor < 0) {
      leaves = true;
      if (p.amount.currency === currency) out -= p.amount.amountMinor;
    }
    if (group === 'on' && p.amount.amountMinor > 0) {
      enters = true;
      if (p.amount.currency === currency) into += p.amount.amountMinor;
    }
  }
  return { leaves, enters, moved: Math.min(out, into) };
}

// What an expense took from on-budget accounts in `currency` that counts as
// spending: its cash side less what people owe back (ADR 0024).
function expenseSides(
  entry: Transaction,
  groups: ReadonlyMap<AccountId, BudgetGroup>,
  currency: CurrencyCode,
  ctx: Context,
): Readonly<{ pays: boolean; counted: number }> {
  let cash = 0;
  let lent = 0;
  let pays = false;
  for (const p of entry.postings) {
    if (groups.get(p.accountId) === 'on' && p.amount.amountMinor < 0) {
      pays = true;
      if (p.amount.currency === currency) cash -= p.amount.amountMinor;
    }
    if (ctx.isRole(p.accountId, 'receivables') && p.amount.amountMinor > 0) {
      if (p.amount.currency === currency) lent += p.amount.amountMinor;
    }
  }
  return { pays, counted: Math.max(0, cash - lent) };
}

type Used = Map<string, number>;

function check(
  ctx: Context,
  link: WithdrawalLink,
  used: Used,
  commit: boolean,
): LinkRefusal | null {
  const withdrawal = ctx.entries.get(link.withdrawalId);
  if (withdrawal === undefined) return 'withdrawal_missing';
  if (ctx.reversed.has(withdrawal.id)) return 'withdrawal_undone';
  if (withdrawal.kind !== 'transfer') return 'withdrawal_not_transfer';
  const expense = ctx.entries.get(link.expenseId);
  if (expense === undefined) return 'expense_missing';
  if (ctx.reversed.has(expense.id)) return 'expense_undone';
  if (expense.kind !== 'expense') return 'expense_not_expense';
  if (ctx.outside.has(expense.id)) return 'expense_outside_funded';
  if (ctx.billPayments.has(expense.id)) return 'expense_bill_payment';

  const { amountMinor, currency } = link.amount;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return 'amount_not_positive';
  }
  const from = withdrawalSides(
    withdrawal,
    ctx.groups(withdrawal.occurredOn),
    currency,
  );
  if (!from.leaves || !from.enters) return 'withdrawal_not_from_savings';
  const to = expenseSides(
    expense,
    ctx.groups(expense.occurredOn),
    currency,
    ctx,
  );
  if (!to.pays) return 'expense_not_on_budget';
  // Both sides exist but not in the link's currency (a transfer between
  // currencies cannot be rewritten exactly), or the expense is all lent.
  if (from.moved === 0 || to.counted === 0) return 'currency_mismatch';
  const wKey = `w|${withdrawal.id}|${currency}`;
  const eKey = `e|${expense.id}|${currency}`;
  if ((used.get(wKey) ?? 0) + amountMinor > from.moved) {
    return 'withdrawal_exceeded';
  }
  if ((used.get(eKey) ?? 0) + amountMinor > to.counted) {
    return 'expense_exceeded';
  }
  if (commit) {
    used.set(wKey, (used.get(wKey) ?? 0) + amountMinor);
    used.set(eKey, (used.get(eKey) ?? 0) + amountMinor);
  }
  return null;
}

function evaluate(
  view: LedgerView,
  links: readonly WithdrawalLink[],
  seed: readonly WithdrawalLink[] = [],
): LinkValidity {
  const ctx = contextOf(view);
  const used: Used = new Map();
  for (const link of seed) check(ctx, link, used, true);
  const valid: WithdrawalLink[] = [];
  const dropped: DroppedLink[] = [];
  for (const link of [...links].sort(byId)) {
    const reason = check(ctx, link, used, true);
    if (reason === null) valid.push(link);
    else dropped.push({ link, reason });
  }
  return { valid, dropped };
}

type ValidityMemo = Readonly<{
  length: number;
  signature: string;
  chart: LedgerView['chart'];
  pools: LedgerView['pools'];
  count: boolean | undefined;
  value: LinkValidity;
}>;
const validityMemo = new WeakMap<readonly Transaction[], ValidityMemo>();

// What the validity reads besides the ledger, chart and pools, as text: the
// links, the entries linked to bills and the outside-funded ones. Cheap, and
// equal for equal content, so a view rebuilt per request still hits the memo.
function signatureOf(view: LedgerView, links: readonly WithdrawalLink[]) {
  const payments = view.bills.flatMap((b) =>
    b.payments.flatMap((p) =>
      p.transactionId == null ? [] : [p.transactionId],
    ),
  );
  return JSON.stringify([
    links.map((l) => [
      l.id,
      l.withdrawalId,
      l.expenseId,
      l.amount.amountMinor,
      l.amount.currency,
    ]),
    payments.sort(),
    [...(view.outsideFunded ?? [])].sort(),
  ]);
}

/**
 * Which of the view's links count and which are dropped, with a reason for
 * each. Links are taken in id order, so when the caps cut some off the
 * outcome is the same on every run. Remembered per ledger.
 */
export function linkValidity(view: LedgerView): LinkValidity {
  const links = view.withdrawalLinks;
  if (links === undefined || links.length === 0) {
    return { valid: [], dropped: [] };
  }
  const signature = signatureOf(view, links);
  const known = validityMemo.get(view.ledger);
  if (
    known?.length === view.ledger.length &&
    known.signature === signature &&
    known.chart === view.chart &&
    known.pools === view.pools &&
    known.count === view.settings.countSavingsInDaily
  ) {
    return known.value;
  }
  const value = evaluate(view, links);
  validityMemo.set(view.ledger, {
    length: view.ledger.length,
    signature,
    chart: view.chart,
    pools: view.pools,
    count: view.settings.countSavingsInDaily,
    value,
  });
  return value;
}

/** The links that count, ordered by id. */
export function validLinks(view: LedgerView): readonly WithdrawalLink[] {
  return linkValidity(view).valid;
}

/**
 * Whether `link` could be added to the view's links now: null when it fits
 * on top of the links that already count, else the reason. A link with the
 * id of an existing one is checked in its place.
 */
export function checkLink(
  view: LedgerView,
  link: WithdrawalLink,
): LinkRefusal | null {
  const seed = validLinks(view).filter((l) => l.id !== link.id);
  const ctx = contextOf(view);
  const used: Used = new Map();
  for (const l of seed) check(ctx, l, used, true);
  return check(ctx, link, used, false);
}

// The most a link may be for on its two entries, for a picker to prefill:
// what is left on each side after the other links, the smaller of the two.
export function linkRoom(
  view: LedgerView,
  withdrawalId: TransactionId,
  expenseId: TransactionId,
  currency: CurrencyCode,
  /** A link being edited, left out of what is used. */
  except?: WithdrawalLinkId,
): number {
  const ctx = contextOf(view);
  const withdrawal = ctx.entries.get(withdrawalId);
  const expense = ctx.entries.get(expenseId);
  if (withdrawal === undefined || expense === undefined) return 0;
  const used: Used = new Map();
  for (const l of validLinks(view)) {
    if (l.id !== except) check(ctx, l, used, true);
  }
  const probe: WithdrawalLink = {
    id: withdrawalLinkId(''),
    withdrawalId,
    expenseId,
    amount: money(1, currency),
  };
  if (check(ctx, probe, used, false) !== null) return 0;
  const from = withdrawalSides(
    withdrawal,
    ctx.groups(withdrawal.occurredOn),
    currency,
  );
  const to = expenseSides(
    expense,
    ctx.groups(expense.occurredOn),
    currency,
    ctx,
  );
  return Math.max(
    0,
    Math.min(
      from.moved - (used.get(`w|${withdrawalId}|${currency}`) ?? 0),
      to.counted - (used.get(`e|${expenseId}|${currency}`) ?? 0),
    ),
  );
}

// ---------------------------------------------------------------------------
// The budget view

type Edit = {
  /** Magnitude taken off each posting, by index. */
  readonly reduce: Map<number, number>;
  /** New postings for the savings account that paid, by account. */
  readonly extra: Map<AccountId, Money>;
};

function rewrite(
  view: LedgerView,
  links: readonly WithdrawalLink[],
): readonly Transaction[] {
  const ctx = contextOf(view);
  const edits = new Map<TransactionId, Edit>();
  const editOf = (id: TransactionId): Edit => {
    let found = edits.get(id);
    if (found === undefined) {
      found = { reduce: new Map(), extra: new Map() };
      edits.set(id, found);
    }
    return found;
  };
  // Takes `amount` from the postings picked by `pick`, first to last, and
  // returns what each gave.
  const take = (
    entry: Transaction,
    edit: Edit,
    amount: number,
    currency: CurrencyCode,
    pick: (p: Posting) => boolean,
  ): { accountId: AccountId; taken: number }[] => {
    const pieces: { accountId: AccountId; taken: number }[] = [];
    let left = amount;
    entry.postings.forEach((p, index) => {
      if (left === 0 || p.amount.currency !== currency || !pick(p)) return;
      const room =
        Math.abs(p.amount.amountMinor) - (edit.reduce.get(index) ?? 0);
      const taken = Math.min(room, left);
      if (taken <= 0) return;
      edit.reduce.set(index, (edit.reduce.get(index) ?? 0) + taken);
      pieces.push({ accountId: p.accountId, taken });
      left -= taken;
    });
    return pieces;
  };
  for (const link of links) {
    const withdrawal = ctx.entries.get(link.withdrawalId);
    const expense = ctx.entries.get(link.expenseId);
    if (withdrawal === undefined || expense === undefined) continue;
    const { amountMinor, currency } = link.amount;
    const wGroups = ctx.groups(withdrawal.occurredOn);
    const wEdit = editOf(withdrawal.id);
    const source = take(
      withdrawal,
      wEdit,
      amountMinor,
      currency,
      (p) => wGroups.get(p.accountId) === 'off' && p.amount.amountMinor < 0,
    );
    take(
      withdrawal,
      wEdit,
      amountMinor,
      currency,
      (p) => wGroups.get(p.accountId) === 'on' && p.amount.amountMinor > 0,
    );
    const eGroups = ctx.groups(expense.occurredOn);
    const eEdit = editOf(expense.id);
    take(
      expense,
      eEdit,
      amountMinor,
      currency,
      (p) => eGroups.get(p.accountId) === 'on' && p.amount.amountMinor < 0,
    );
    for (const { accountId, taken } of source) {
      const before = eEdit.extra.get(accountId)?.amountMinor ?? 0;
      eEdit.extra.set(accountId, money(before - taken, currency));
    }
  }
  return view.ledger.map((t) => {
    const edit = edits.get(t.id);
    if (edit === undefined) return t;
    const postings: Posting[] = t.postings.map((p, index) => {
      const cut = edit.reduce.get(index) ?? 0;
      if (cut === 0) return p;
      // Magnitude shrinks toward zero whichever way the posting points.
      const amountMinor =
        p.amount.amountMinor < 0
          ? p.amount.amountMinor + cut
          : p.amount.amountMinor - cut;
      return { ...p, amount: money(amountMinor, p.amount.currency) };
    });
    for (const [accountId, amount] of edit.extra) {
      postings.push({ accountId, amount, categoryId: null });
    }
    return { ...t, postings };
  });
}

function withoutLinks(view: LedgerView): LedgerView {
  const copy: { -readonly [K in keyof LedgerView]: LedgerView[K] } = {
    ...view,
  };
  delete copy.withdrawalLinks;
  return copy;
}

type ViewMemo = Readonly<{
  length: number;
  validity: LinkValidity;
  ledger: readonly Transaction[];
}>;
const viewMemo = new WeakMap<readonly Transaction[], ViewMemo>();

/**
 * The view the budget reads (docs/domain.md "Withdrawal links"): for each
 * valid link of amount C, the withdrawal moves C less and the expense takes
 * C from the savings account the withdrawal came from instead of from the
 * on-budget account. Entries keep their ids and still balance per currency;
 * balances of the savings and spending accounts differ only on the days
 * between the two entries. Returns `view` itself when no link counts, and
 * the rewritten ledger is remembered per ledger, so the ledger-wide indexes
 * are derived once. The result carries no links, so applying it again
 * changes nothing.
 */
export function budgetView(view: LedgerView): LedgerView {
  if (view.withdrawalLinks === undefined) return view;
  const validity = linkValidity(view);
  if (validity.valid.length === 0) return view;
  const rest = withoutLinks(view);
  const known = viewMemo.get(view.ledger);
  if (known?.length === view.ledger.length && known.validity === validity) {
    return { ...rest, ledger: known.ledger };
  }
  const ledger = rewrite(view, validity.valid);
  viewMemo.set(view.ledger, { length: view.ledger.length, validity, ledger });
  return { ...rest, ledger };
}
