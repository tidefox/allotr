import {
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type {
  CategoryId,
  Transaction,
  TransactionId,
} from '../ledger/types.ts';
import {
  budgetPeriodOn,
  heldBy,
  leftOf,
  type Budget,
  type BudgetId,
  type BudgetPeriod,
  type CoverSource,
  type DailyMode,
  type SpendLine,
  type TagId,
} from './budgets.ts';
import { budgetFold, dailyFiguresOn } from './daily.ts';
import type { LedgerView } from './types.ts';

// What the Budget view reads (ADR 0021): every budget's figures for the
// current period, and what is free once set-aside budgets hold their share.

/** One budget's figures for a period, in the default currency. */
export type BudgetLineStatus = Readonly<{
  budget: Budget;
  /** Planned for the period. */
  planned: Money;
  /** Left over from earlier periods, when the budget carries. */
  carriedIn: Money;
  spent: Money;
  /** What is left to spend: planned plus carried in and restored, less its own spending and what others took. Never negative. */
  left: Money;
  /** The part of `spent` that went past what it had left, so others covered it. */
  overflow: Money;
  /** What other budgets' shortfalls took from it. */
  coveredOut: Money;
  /** What came back to it as a refill. */
  restored: Money;
  /** What a set-aside budget still holds out of free money; zero otherwise. */
  held: Money;
  /**
   * What other sources paid of this budget's shortfall this period, per
   * source, in cover order. Only sources that paid something are listed.
   */
  coverUsed: readonly CoverUsed[];
}>;

/** What one source covered for one budget in the period. */
export type CoverUsed = Readonly<{ source: CoverSource; amount: Money }>;

/**
 * Every budget's figures added up, each budget once (parent headers are not
 * counted twice), in the default currency. The Buffer is a budget: it adds
 * what it holds to `left` and nothing to `spent`.
 */
export type BudgetTotals = Readonly<{
  planned: Money;
  spent: Money;
  left: Money;
}>;

/**
 * A parent category's budgets added up: the budgets on its children and on
 * the parent itself, in the default currency.
 */
export type ParentBudgetTotals = Readonly<{
  categoryId: CategoryId;
  /** The budgets counted, in the order of `lines`. */
  budgetIds: readonly BudgetId[];
  planned: Money;
  spent: Money;
  left: Money;
}>;

/** How much of the period's shortfall was covered, and by whom. */
export type CoveredFigures = Readonly<{
  /** Spending past what its own budget had left, or in no budget at all. */
  shortfall: Money;
  fromFree: Money;
  fromBuffer: Money;
  fromBudgets: Money;
  /** What nothing covered: it lowered the daily number. */
  uncovered: Money;
}>;

export type BudgetStatus = Readonly<{
  today: LocalDate;
  period: BudgetPeriod;
  /** Days left in the cycle, as for the daily number. */
  daysLeft: number;
  lines: readonly BudgetLineStatus[];
  /**
   * Totals for each parent category that has a budget on at least one of its
   * children, summing every category budget under it.
   */
  parents: readonly ParentBudgetTotals[];
  /** Every budget added up once; see `BudgetTotals`. */
  totals: BudgetTotals;
  /** Counted accounts less unpaid reserved bills. */
  available: Money;
  /** Set-aside budgets' holds, Buffer included. */
  held: Money;
  /** `available` less `held`. */
  free: Money;
  /** What the daily budgets have left in total. */
  dailyLeft: Money;
  /** Spending in the period that no budget counts. */
  unbudgeted: Money;
  dailyMode: DailyMode;
  /** The daily number: what `dailyMode` divides, over the days left. */
  dailyNumber: Money;
  /** Who covers a shortfall, first to last. */
  coverOrder: readonly CoverSource[];
  /** Cover in the current period. */
  covered: CoveredFigures;
  missingRates: readonly CurrencyCode[];
}>;

/** Sums the category budgets under each parent that has a child budget. */
export function parentBudgetTotals(
  view: LedgerView,
  lines: readonly BudgetLineStatus[],
): ParentBudgetTotals[] {
  const categories = view.budgets?.categories;
  if (categories === undefined) return [];
  const currency = view.settings.defaultCurrency;
  const groups = new Map<
    CategoryId,
    { hasChild: boolean; lines: BudgetLineStatus[] }
  >();
  for (const line of lines) {
    const target = line.budget.target;
    if (target.kind !== 'category') continue;
    const parent = categories.get(target.categoryId)?.parent ?? null;
    const key = parent ?? target.categoryId;
    const group = groups.get(key) ?? { hasChild: false, lines: [] };
    group.hasChild ||= parent !== null;
    group.lines.push(line);
    groups.set(key, group);
  }
  const total = (
    group: readonly BudgetLineStatus[],
    pick: (l: BudgetLineStatus) => Money,
  ) =>
    money(
      group.reduce((sum, l) => sum + pick(l).amountMinor, 0),
      currency,
    );
  return [...groups]
    .filter(([, group]) => group.hasChild)
    .map(([categoryId, group]) => ({
      categoryId,
      budgetIds: group.lines.map((l) => l.budget.id),
      planned: total(group.lines, (l) => l.planned),
      spent: total(group.lines, (l) => l.spent),
      left: total(group.lines, (l) => l.left),
    }));
}

/** Adds every budget's planned, spent and left once. */
export function budgetTotals(
  view: Pick<LedgerView, 'settings'>,
  lines: readonly Pick<BudgetLineStatus, 'planned' | 'spent' | 'left'>[],
): BudgetTotals {
  const currency = view.settings.defaultCurrency;
  const total = (pick: (l: (typeof lines)[number]) => Money) =>
    money(
      lines.reduce((sum, l) => sum + pick(l).amountMinor, 0),
      currency,
    );
  return {
    planned: total((l) => l.planned),
    spent: total((l) => l.spent),
    left: total((l) => l.left),
  };
}

/**
 * What each source covered of the shortfalls of `lines` (one budget's spend
 * in the period), summed per source and listed in cover order, then any
 * source the order no longer names. Sources that covered nothing are left
 * out.
 */
function coverUsedBy(
  lines: readonly SpendLine[],
  order: readonly CoverSource[],
  currency: CurrencyCode,
): CoverUsed[] {
  const taken = new Map<CoverSource, bigint>();
  for (const line of lines) {
    for (const c of line.covers) {
      taken.set(c.source, (taken.get(c.source) ?? 0n) + c.amount);
    }
  }
  const rank = (source: CoverSource) => {
    const at = order.indexOf(source);
    return at < 0 ? order.length : at;
  };
  return [...taken]
    .filter(([, amount]) => amount !== 0n)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([source, amount]) => ({
      source,
      amount: money(Number(amount), currency),
    }));
}

/** Budget figures as of `today`, from the same ledger the daily number reads. */
export function budgetStatus(view: LedgerView, today: LocalDate): BudgetStatus {
  const currency = view.settings.defaultCurrency;
  const fold = budgetFold(view, today);
  const daily = dailyFiguresOn(view, today);
  const m = (amount: bigint) => money(Number(amount), currency);
  const inPeriod = (fold?.spend ?? []).filter(
    (l) =>
      fold !== null && l.date >= fold.period.from && l.date < fold.period.to,
  );
  const lines = (fold?.lines ?? []).map((line): BudgetLineStatus => ({
    budget: line.budget,
    planned: m(line.amount),
    carriedIn: m(line.carriedIn),
    spent: m(line.spent),
    left: m(leftOf(line)),
    overflow: m(line.overflow),
    coveredOut: m(line.coveredOut),
    restored: m(line.restored),
    held: m(heldBy(line)),
    coverUsed: coverUsedBy(
      inPeriod.filter((l) => l.budgetId === line.budget.id),
      fold?.order ?? [],
      currency,
    ),
  }));
  const buffer = (fold?.lines ?? []).find(
    (l) => l.budget.target.kind === 'buffer',
  );
  const sum = (pick: (l: SpendLine) => bigint) =>
    inPeriod.reduce((total, l) => total + pick(l), 0n);
  const taken = (match: (source: CoverSource) => boolean) =>
    sum((l) =>
      l.covers.reduce((t, c) => (match(c.source) ? t + c.amount : t), 0n),
    );
  const dailyLeft = (fold?.lines ?? [])
    .filter((l) => l.budget.mode === 'daily')
    .reduce((sum, l) => sum + leftOf(l), 0n);
  return {
    today,
    period: fold?.period ?? budgetPeriodOn(view, today, today),
    daysLeft: daily.daysLeft,
    lines,
    parents: parentBudgetTotals(view, lines),
    totals: budgetTotals(view, lines),
    available: daily.available,
    held: daily.held,
    free: daily.free,
    dailyLeft: m(dailyLeft),
    unbudgeted: m(fold?.unbudgeted ?? 0n),
    dailyMode: daily.dailyMode,
    dailyNumber: daily.liveDaily,
    coverOrder: fold?.order ?? ['free'],
    covered: {
      shortfall: m(sum((l) => l.amount - l.own)),
      fromFree: m(taken((source) => source === 'free')),
      fromBuffer: m(taken((source) => source === buffer?.budget.id)),
      fromBudgets: m(
        taken((source) => source !== 'free' && source !== buffer?.budget.id),
      ),
      uncovered: m(sum((l) => l.uncovered)),
    },
    missingRates: daily.missingRates,
  };
}

/** One entry's cover in the current period, in the default currency. */
export type BudgetCover = Readonly<{
  entryId: TransactionId;
  date: LocalDate;
  budgetId: BudgetId | null;
  /** Money lent to people, covered like spending but not spending. */
  loan: boolean;
  amount: Money;
  /** What its own budget paid. */
  own: Money;
  covers: readonly Readonly<{ source: CoverSource; amount: Money }>[];
  uncovered: Money;
  /** The user chose this split. */
  overridden: boolean;
}>;

/**
 * Every line in the current period that went past what its budget had left,
 * newest first, with who covered it: what the entry sheet showed, kept
 * visible afterwards.
 */
export function budgetCovers(
  view: LedgerView,
  today: LocalDate,
): BudgetCover[] {
  const fold = budgetFold(view, today);
  if (fold === null) return [];
  const m = (amount: bigint) =>
    money(Number(amount), view.settings.defaultCurrency);
  return fold.spend
    .filter(
      (l) =>
        l.date >= fold.period.from &&
        l.date < fold.period.to &&
        l.amount > l.own,
    )
    .map((l) => ({
      entryId: l.entryId,
      date: l.date,
      budgetId: l.budgetId,
      loan: l.loan,
      amount: m(l.amount),
      own: m(l.own),
      covers: l.covers.map((c) => ({ source: c.source, amount: m(c.amount) })),
      uncovered: m(l.uncovered),
      overridden: l.overridden,
    }))
    .reverse();
}

/** One expense line of an entry and how its budget stood after it. */
export type EntryBudgetLine = Readonly<{
  /** The budget that counted the line; null when none did. */
  budgetId: BudgetId | null;
  /** The budget period the entry's date falls in. */
  period: BudgetPeriod;
  loan: boolean;
  amount: Money;
  /** What its own budget paid. */
  own: Money;
  covers: readonly Readonly<{ source: CoverSource; amount: Money }>[];
  uncovered: Money;
  overridden: boolean;
  /** What its budget had left right after this line; null with no budget. */
  leftAfter: Money | null;
}>;

/**
 * The budget figures of one entry, in any period: for each expense line
 * that was counted, what its budget had left just after it, and who
 * covered the part past that. Empty when the entry is not counted (an
 * income, a transfer, spending from a savings account, or an undone entry),
 * or there are no budgets.
 */
export function entryBudgetLines(
  view: LedgerView,
  today: LocalDate,
  entryId: TransactionId,
): EntryBudgetLine[] {
  const fold = budgetFold(view, today);
  if (fold === null) return [];
  const m = (amount: bigint) =>
    money(Number(amount), view.settings.defaultCurrency);
  return fold.spend
    .filter((l) => l.entryId === entryId)
    .map((l) => ({
      budgetId: l.budgetId,
      period: budgetPeriodOn(view, l.date, today),
      loan: l.loan,
      amount: m(l.amount),
      own: m(l.own),
      covers: l.covers.map((c) => ({ source: c.source, amount: m(c.amount) })),
      uncovered: m(l.uncovered),
      overridden: l.overridden,
      leftAfter: l.leftAfter === null ? null : m(l.leftAfter),
    }));
}

/** What recording an expense would take, before it is saved. */
export type CoverPreview = Readonly<{
  /** False when no budget counts it: paid from a savings account, say. */
  counted: boolean;
  budgetId: BudgetId | null;
  amount: Money;
  own: Money;
  covers: readonly Readonly<{
    source: CoverSource;
    amount: Money;
    /** The source is a set-aside budget or the Buffer. */
    setAside: boolean;
  }>[];
  uncovered: Money;
  /** The cover reaches into a set-aside budget or the Buffer. */
  reachesSetAside: boolean;
  /** Nothing covers part of it: the daily number goes lower. */
  overspend: boolean;
  /** A second tap is needed: it reaches set-aside money or is uncovered. */
  needsConfirmation: boolean;
  leftToday: Readonly<{ before: Money; after: Money }>;
}>;

/**
 * Works out the cover for `entry` as if it were in the ledger, without
 * recording it. `tags` are the tags it would carry.
 */
export function coverPreview(
  view: LedgerView,
  today: LocalDate,
  entry: Transaction,
  tags: readonly TagId[] = [],
): CoverPreview {
  const currency = view.settings.defaultCurrency;
  const m = (amount: bigint) => money(Number(amount), currency);
  const withEntry: LedgerView = {
    ...view,
    ledger: [...view.ledger, entry],
    ...(view.budgets === undefined
      ? {}
      : {
          budgets: {
            ...view.budgets,
            entryTags: new Map([...view.budgets.entryTags, [entry.id, tags]]),
          },
        }),
  };
  const before = dailyFiguresOn(view, today).leftToday;
  const after = dailyFiguresOn(withEntry, today).leftToday;
  const fold = budgetFold(withEntry, today);
  const lines = (fold?.spend ?? []).filter((l) => l.entryId === entry.id);
  const setAside = new Set(
    (fold?.lines ?? [])
      .filter((l) => l.budget.mode === 'set-aside')
      .map((l) => l.budget.id),
  );
  const takes = new Map<CoverSource, bigint>();
  for (const line of lines) {
    for (const c of line.covers) {
      takes.set(c.source, (takes.get(c.source) ?? 0n) + c.amount);
    }
  }
  const uncovered = lines.reduce((sum, l) => sum + l.uncovered, 0n);
  const reachesSetAside = [...takes.keys()].some(
    (source) => source !== 'free' && setAside.has(source),
  );
  return {
    counted: lines.length > 0,
    budgetId: lines[0]?.budgetId ?? null,
    amount: m(lines.reduce((sum, l) => sum + l.amount, 0n)),
    own: m(lines.reduce((sum, l) => sum + l.own, 0n)),
    covers: [...takes].map(([source, amount]) => ({
      source,
      amount: m(amount),
      setAside: source !== 'free' && setAside.has(source),
    })),
    uncovered: m(uncovered),
    reachesSetAside,
    overspend: uncovered > 0n,
    needsConfirmation: reachesSetAside || uncovered > 0n,
    leftToday: { before, after },
  };
}
