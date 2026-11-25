import { reversedIds } from '../ledger/indexes.ts';
import { addDays, type LocalDate } from '@allotr/shared';
import type { Transaction } from '../ledger/types.ts';
import { compareEntries } from '../ledger/order.ts';
import { nextPayday } from './payday.ts';
import type { DateWindow } from './policies.ts';
import type { Cycle, EntryKey, LedgerView } from './types.ts';

// Cycles run from one paycheck to the next (docs/domain.md "Cycles",
// FR-C1, FR-C2). They are derived from the ledger as of `today`, so a
// back-dated or undone paycheck reshapes them through the same function.

/** A paycheck this close to payday starts the next cycle early. */
const EARLY_PAYCHECK_DAYS = 3;

const ordered = compareEntries;

function earliest(first: LocalDate, ...dates: LocalDate[]): LocalDate {
  return dates.reduce((a, b) => (b < a ? b : a), first);
}

function paychecks(view: LedgerView, today: LocalDate): Transaction[] {
  const reversed = reversedIds(view.ledger);
  return view.ledger
    .filter(
      (t) =>
        t.kind === 'income' &&
        // A split income opens a cycle when any of its lines is a paycheck.
        t.postings.some(
          (p) =>
            p.categoryId !== null && view.paycheckCategories.has(p.categoryId),
        ) &&
        !reversed.has(t.id) &&
        t.occurredOn <= today,
    )
    .sort(ordered);
}

/**
 * Every cycle up to `today`, oldest first. Exactly the last one is open
 * (invariant 5), and each closes on the day the next one opens.
 */
export function cyclesOf(view: LedgerView, today: LocalDate): Cycle[] {
  const { paydayRule, paydayDay, paydayOverride, startedOn } = view.settings;
  const found = paychecks(view, today);
  // Only a paycheck moves the start, so a back-dated expense never
  // reshapes the cycles.
  const first = earliest(startedOn, today, found[0]?.occurredOn ?? today);

  const cycles: Cycle[] = [];
  let open: Cycle = {
    openedOn: first,
    openedBy: null,
    cut: null,
    payday: nextPayday(paydayRule, paydayDay, first),
    closedOn: null,
  };
  for (const paycheck of found) {
    const date = paycheck.occurredOn;
    if (date === open.openedOn && open.openedBy === null) {
      // A paycheck on the first day opens the first cycle.
      open = { ...open, openedBy: paycheck.id };
    } else if (
      date > open.openedOn &&
      date >= addDays(open.payday, -EARLY_PAYCHECK_DAYS)
    ) {
      cycles.push({ ...open, closedOn: date });
      // An early paycheck is the one due on payday, so the new cycle runs
      // to the payday after that, not to the payday it came early for.
      const after = date > open.payday ? date : open.payday;
      open = {
        openedOn: date,
        openedBy: paycheck.id,
        cut: {
          id: paycheck.id,
          occurredOn: paycheck.occurredOn,
          sortRank: paycheck.sortRank,
          createdAt: paycheck.createdAt,
        },
        payday: nextPayday(paydayRule, paydayDay, after),
        closedOn: null,
      };
    }
    // Any other paycheck adds to the open cycle (the "second paycheck"
    // guess in docs/domain.md "Policies").
  }
  if (paydayOverride !== null && paydayOverride > open.openedOn) {
    open = { ...open, payday: paydayOverride };
  }
  cycles.push(open);
  return cycles;
}

/**
 * Where a cycle's entries start and stop (ADR 0039). The paycheck that
 * opens a cycle cuts its day: entries ordered before it belong to the
 * cycle it closed. An undo goes with the entry it undoes, so a pair never
 * splits across a cut.
 */
export type CycleSpan = Readonly<{
  /** The entry is ordered before the cycle's first entry. */
  before: (t: Transaction) => boolean;
  /** The entry belongs to the cycle (open cycles run through `today`). */
  has: (t: Transaction) => boolean;
  /** The entry is not after the cycle: it is in it or before it. */
  notAfter: (t: Transaction) => boolean;
}>;

// Spans are built many times for one ledger in a request, so the lookup is
// kept per ledger array (loaded ledgers are frozen and shared).
const byIdOf = new WeakMap<readonly Transaction[], Map<string, Transaction>>();

export function cycleSpan(
  ledger: readonly Transaction[],
  cycles: readonly Cycle[],
  cycle: Cycle,
  today: LocalDate,
): CycleSpan {
  let byId = byIdOf.get(ledger);
  if (byId === undefined) {
    byId = new Map(ledger.map((t) => [t.id, t]));
    byIdOf.set(ledger, byId);
  }
  const originals = byId;
  const keyOf = (t: Transaction): EntryKey =>
    (t.reversesId === null ? undefined : originals.get(t.reversesId)) ?? t;
  const beforeCycle =
    (c: Cycle) =>
    (t: Transaction): boolean =>
      c.cut === null
        ? t.occurredOn < c.openedOn
        : compareEntries(keyOf(t), c.cut) < 0;
  const before = beforeCycle(cycle);
  const next = cycles.find((c) => c.openedOn > cycle.openedOn);
  const notAfter =
    next === undefined
      ? (t: Transaction) => t.occurredOn <= today
      : beforeCycle(next);
  return { before, has: (t) => !before(t) && notAfter(t), notAfter };
}

/** The cycle a day belongs to; days before the first go to the first. */
export function cycleOn(cycles: readonly Cycle[], date: LocalDate): Cycle {
  const found = cycles.findLast((cycle) => cycle.openedOn <= date);
  const cycle = found ?? cycles[0];
  if (cycle === undefined) throw new RangeError('There are no cycles.');
  return cycle;
}

/** The days whose bills a cycle reserves: from opening up to payday. */
export function billWindow(cycle: Cycle): DateWindow {
  const to =
    cycle.closedOn !== null && cycle.closedOn > cycle.payday
      ? cycle.closedOn
      : cycle.payday;
  return { from: cycle.openedOn, to };
}

/**
 * The day after the cycle's last day as seen on `date`: the payday, or,
 * from payday on until a paycheck arrives, the next day (the cycle runs
 * one day at a time, and is overdue the day after payday).
 */
export function cycleEndOn(cycle: Cycle, date: LocalDate): LocalDate {
  return date >= cycle.payday ? addDays(date, 1) : cycle.payday;
}
