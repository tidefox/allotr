# 0039. A cycle opens at its paycheck, not at the start of its day

- Status: Accepted
- Date: 2026-11-25

## Context

A paycheck opens a cycle on its date (docs/domain.md, Cycles). Cycles
work in whole days: every entry with `occurredOn >= cycle.openedOn`
belongs to the new cycle (`projections/cycles.ts`, `snapshot.ts`,
`allocation.ts`).

Pay usually arrives part-way through the day. A user who spends $12 on
breakfast and $30 on a top-up in the morning, and is paid $2,000 in the
afternoon, sees:

- the new cycle open with $42 already spent, money that came out of the
  previous pay;
- the closed cycle's snapshot showing $42 less spending and $42 more
  leftover than really happened.

Balances stay right; only the split between cycles is wrong. It happens
every payday and is confusing: users think of "the old cycle" as
everything before the money arrived.

The ledger already has an order within a day that the user sees and can
change ([ADR 0025](0025-entry-order-and-time.md), docs/domain.md
"Order within a day"): a new entry goes last, timed entries keep time
order, and a move records nothing in the ledger. Every projection that
takes entries one by one already uses this order (`compareEntries`).

## Decision

**The boundary between two cycles is the opening paycheck's place in
its day, not the start of that day.**

1. On the day a paycheck opens a cycle, entries ordered **before** the
   paycheck (by `compareEntries`) belong to the closing cycle; the
   paycheck and every entry after it belong to the new one. Every other
   day stays whole.
2. The order is the ADR 0025 day order, not recording time. Logging in
   real time puts things in the right place with no extra input. An
   entry logged late but that happened before pay is moved up in the
   day, or given a time. Both already exist.
3. A cycle is identified as now by `openedOn` and `openedBy` (the
   paycheck). The closed cycle's last day becomes the paycheck day
   (partial) instead of the day before it.
4. **Opening balances** of the new cycle are the counted balances just
   before the paycheck, not at the end of the day before. The "money free
   just before an entry" walk in `budgets.ts` already computes this.
5. **Payday's daily figures.** The payday row of the new cycle counts
   only entries from the paycheck on. Entries before it fall in the
   closing cycle's last row. `start_of_day` for the new cycle's first
   day is `available` just before the paycheck, plus the paycheck.
6. Only the paycheck that **opens** a cycle cuts it. A second paycheck
   that adds to the open cycle, early paychecks (within 3 days of
   payday) and undoing a paycheck (merges cycles back) keep their
   current rules.
7. Fixed-period cycle mode (no paycheck opens the period) is unchanged.

### Example

Day 0 (payday) in order: breakfast $12, top-up $30, paycheck +$2,000,
dinner $25.

| | Today | With this decision |
|---|---|---|
| Closing cycle, last day | day −1 | day 0 up to the top-up |
| Closing cycle spending | excludes $42 | includes $42 |
| New cycle opening balance | end of day −1 | just before the paycheck |
| New cycle spent on day 0 | $67 | $25 |

## What has to change

Everything that slices by `openedOn` / `closedOn`. All of it is in
`packages/core/src/projections/` plus the store wrappers:

- `cycles.ts`: `cycleOn(date)` becomes `cycleOf(entry)` for entries on a
  cutting day. Date-only callers (calendar, reminders, payday) keep
  `cycleOn` and treat the payday as the new cycle's day.
- `snapshot.ts`: period filter and opening balances use the cut.
- `allocation.ts`: `start` = balances just before the paycheck; the
  day walk splits payday.
- `daily.ts`: `spent_today`, `cycle_spent`, pace and the `/days` rows
  (payday appears in both cycles' rows, each with its own part).
- `budgets.ts`, `plan.ts`: budget periods that follow the cycle split
  the same way. Calendar-month periods are unaffected.
- `history.ts`, `series.ts`, `category-series.ts`, `pool-cycle.ts`:
  per-cycle sums.
- Amendments: moving an entry across the paycheck changes a closed
  cycle. It counts as an amendment like a back-dated entry. A move
  records nothing, so this needs the move's time (open question 3).
- docs/domain.md (Cycles, Daily usable, Cycle allocation), OpenAPI
  descriptions for cycle and day rows.
- Property tests: every entry is in exactly one cycle; cycle spending
  sums to total spending; moving an entry within a non-paycheck day
  never changes any cycle figure.

## Alternatives considered

- **Keep whole days (status quo).** Simplest. The user dates payday-
  morning spending to the day before, which misstates the date.
- **Use recording time (`createdAt`).** No user control. A late-logged
  morning coffee lands in the new cycle. Device clocks differ across
  synced devices. Rejected in favour of the day order the user sees.
- **"Cycle starts tomorrow" on the paycheck.** Afternoon and evening
  spending of payday then falls in the old cycle, the same problem
  reversed.
- **A "Start new cycle" button without an entry.** It breaks "a paycheck
  opens a cycle" (the only way today) and still cuts at a date, so it
  does not fix the problem.

## Consequences

- Cycle figures match what the user means by "before / after pay".
- Closed snapshots are computed on read, so **past cycles change** once
  this lands. Every payday where something was logged before the
  paycheck moves that spending back to the previous cycle. This is
  intended, but it is visible.
- Payday is the one day that belongs to two cycles; charts and the
  calendar must show it once, with a split where it matters.
- Reordering entries on payday now changes cycle figures; on other days
  it still only affects budget cover, as today.
- More code in core than any other option; covered by the property
  tests above.

## Settled with acceptance

- The cut follows the ADR 0025 day order, not recording time.
- Past cycles are recomputed: closed snapshots are derived on read, so
  every past payday takes the cut, with no cut-over date.
- Not decided here: whether a move across the paycheck counts as an
  amendment of the closed cycle (moves record nothing in the ledger
  today), and whether the paycheck form offers to move earlier entries
  before it. Until decided, a move is not an amendment and the form is
  unchanged.
