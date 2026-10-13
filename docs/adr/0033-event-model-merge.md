# 0033. Event model, merge policy and conflict inbox

- Status: Accepted
- Date: 2026-10-13

## Context

ADR 0032 makes the ledger a fold over events written concurrently by
several devices. On one server, the database rejects conflicting writes
through unique constraints and triggers. After a merge, both sides were
valid where they were written.

## Decision

- Every event has `ledgerId`, `eventId`, `author`, `seq` (gapless per
  author), `hlc` (hybrid logical clock), `schema` and `enc` (reserved,
  null in v1). The fold orders by (`hlc`, `author`, `seq`).
- **Facts** (transactions with full postings, tags, replacements, pool
  moves, reconciliations, bill payments, IOU settlements, rate entries)
  are one event each, carrying the full payload. Postings are never
  recomputed.
- **Configuration entities** (accounts, categories, tags, pools, budgets,
  budget amounts, bills, goals, IOUs, settings, cover overrides, entry
  ranks) use created plus per-field last-writer-wins by HLC. Removal is a
  tombstone that wins over concurrent edits; ids are never reused.
- Every constraint that can't hold after a merge gets a written rule: a
  deterministic winner, with the loser put in a **conflict inbox** for
  the user to resolve. Nothing is dropped silently. In particular:
  - Two reversals of one entry: the lowest HLC wins. The loser's reversal
    **and** its replacement are held back from the ledger until the user
    chooses.
  - Duplicate names: both entities are kept; the later one is shown with a
    suffix, and the inbox offers **merge**. A merge is an event that points
    one entity at another: reads resolve the alias, postings are never
    rewritten, and a merge can be undone by a later event.
  - Posting to an account archived concurrently: accepted, then flagged.
- Ledger invariants (integer minor units with a currency, balance per
  currency, append-only facts) hold for every event on its own, so they
  hold for any merge.

## Consequences

- One reducer serves both server and local mode.
- The full per-table policy is a checklist the reducer must cover. A
  property test checks that any interleaving converges to the same state.
