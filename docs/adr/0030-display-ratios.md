# 0030. Display ratios and input aids in the web app

- Status: Accepted
- Date: 2026-10-11
- Amends: docs/ui.md §1 rule 8, `.agent/rules/ui.md` ("Never sum, convert or
  derive money in the web app")

## Context

The v3 screens size progress bars, share bars and chart columns from server
figures. Sizing a bar means dividing one figure by another (for example
"left ÷ start", "spent ÷ (spent + left)", "value ÷ largest value"). Read
strictly, rule 8 forbids that, and the only alternative is for the server to
send a fraction for every bar.

Some forms also show feedback on numbers the user is typing: the amount left
to assign in a split, or an even share for each person in an IOU split. The
server checks these values again when the form is saved.

## Decision

The web app may do two narrow kinds of arithmetic on amounts. In both cases
the result is never shown as money and never sent to the server as fact:

1. **Display ratios.** A bar width, column height or share may come from a
   ratio of figures the server sent in the same currency. Comparisons
   (greater, smaller, sign) are allowed for tone and direction. The ratio sets
   only geometry or a tone. It is never shown as an amount, and a percentage
   is shown only when the server sends it.
2. **Input aids.** A form may sum or split amounts the user typed, to show
   "X left to assign" or to pre-fill even shares. The server validates the
   submitted values and is the source of truth.

Everything else stays on the server: totals shown as amounts, balances,
projections, series, conversions, and any figure a screen shows as money.

## Consequences

- Rule 8 and `.agent/rules/ui.md` are reworded to name these two exceptions.
- Shared helpers carry property tests and clamp their result.
  `barFraction`, `fractionOf`, `fractionsOf` and `segmentShare` return 0..1,
  and 0 when the whole is 0 or less. `spentShare` returns 0..100, and 100
  when something was spent but spent + left is 0 or less (an overspent bar).
- Shares printed as text (the allocation legend, report category shares)
  come from the server in basis points.
- A figure that people read as an amount (a total row, a "change since"
  value) still needs an API field. Such gaps are listed in docs/ui.md §8.
