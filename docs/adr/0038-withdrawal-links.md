# 0038. Savings withdrawals linked to the purchase they paid for

- Status: Accepted
- Date: 2026-10-14

## Context

A common way to pay for something larger than the day-to-day budget is to
move money from a savings account into a spending account and pay from
there. The bank then shows two lines: a transfer in (say +$300 from
savings) and a purchase (say −$340 by card). The user wants the ledger to
mirror the bank one line to one line, so imports and reconciliation stay
simple, but only the $40 they paid themselves should count against the
daily number.

Today the two entries count separately (docs/domain.md, Daily usable):
the transfer is a savings withdrawal and raises the start of the day,
spread over the days left, and the purchase counts in full in
`spent_today`. The daily number jumps up and then down by much more than
$40. The only way around it is to re-enter the purchase as two expenses,
one paid from savings, and drop the transfer, which no longer matches the
bank. `outside` funding (docs/domain.md, Funding) does not help: it never
changes the daily number.

## Decision

A **withdrawal link** ties part of a savings withdrawal to an expense it
paid for. It stores the withdrawal entry, the expense entry and an amount
with its currency. It is a setting on the two entries, like a bill
payment mark: it never changes their postings.

**Rule.** For everything built on the budget (the daily number,
`spent_today`, `cycle_spent`, pace, budgets and cover, the cycle
allocation, the calendar, the weekly review, the savings rate and the
savings-withdrawal policy), the linked amount is read **as if the expense
had paid it straight from the savings account the withdrawal came from**,
and the withdrawal had not moved it. Balances, net worth, account
history, reconciliation, exports and import matching read the real
postings, so they still match the bank.

That one rule gives these effects:

- Same day: the withdrawal does not raise the start of the day, and only
  the unlinked part of the expense counts in `spent_today`.
- Withdrawal first, purchase later: the linked amount is held out of
  `available` in between, like a reserved bill, so the number does not
  jump up and then crash.
- Purchase first, withdrawal later: the linked amount is not taken out of
  `available` in between, since savings will pay it.
- The linked part is not a savings withdrawal: it is not flagged, does not
  lower the cycle's savings, and the tracked-debt policy ignores it.
- Category totals and trends still show the whole expense, as they do for
  an expense paid from a savings account.

**Validity.** A link is accepted when:

- the withdrawal is a transfer in effect (not undone) whose posting leaves
  an off-budget account and enters an on-budget account on its date;
- the expense is an expense entry in effect, paid from an on-budget
  account, with `own` funding and not linked to a bill payment;
- the amount is positive, in the currency of both the withdrawal's
  inbound side and the expense's on-budget side;
- the links on one withdrawal add up to no more than it moved from
  off-budget to on-budget, and the links on one expense add up to no more
  than its on-budget side.

A withdrawal can be linked to several expenses and an expense to several
withdrawals. The dates may come in either order.

**Changes.** A link can be added and removed at any time; both are
recorded (who, when). Undoing either entry takes the link out of every
figure, and restoring it brings it back if it is still valid. An edit
that replaces a linked entry carries the link to the replacement while it
is still valid, and drops it otherwise, telling the user.

**Interfaces.** The API can create, list and remove links and shows them
on both entries. The web app offers "Paid from savings" on an expense and
"Paid for" on a withdrawal, each with an in-app picker of the entries
that can take a link and the amount prefilled with the most that fits. A
chat shortcut that records a transfer, an expense and their link in one
message may follow; it is not part of this decision.

## Consequences

- The bank and the ledger stay one to one; the user no longer has to
  choose between a correct balance history and a correct daily number.
- The rule is stated as an equivalence, so it can be tested as one: on
  every day, every budget figure for a ledger with links equals the figure
  for the same ledger rewritten so each linked amount is paid straight
  from savings. Property tests check this.
- A new table, `withdrawal_links`, sits beside `bill_payments` and
  `cover_overrides`. Postings stay append-only and untouched.
- Projections that read spending from on-budget accounts must apply the
  links; ones that read balances must not. Each projection names which it
  is.
- Local mode (ADR 0032, ADR 0033) needs event types for adding and
  removing a link and a merge policy for the table: add and remove are a
  set by link id, and a link that is no longer valid after a merge is left
  out and flagged.
- The chat grammar does not change yet.
