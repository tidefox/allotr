# 0034. Ledger and device identity, and deterministic ids for automatic writes

- Status: Accepted
- Date: 2026-10-13

## Context

With file sync, a new device often sees an empty or partial folder before
its files have downloaded. Several devices also run the same automatic
jobs (seeding, system accounts, recurring posts, rollover, rate fetches)
while offline. Plugin settings files are synced too, so a device id kept
there would be shared by every device.

## Decision

- A ledger has a genesis file with `ledgerId`, the creation HLC and the
  minimum plugin version. Setup asks the user to **create** or **join** a
  ledger, and never infers this from an empty folder. Joining waits until
  the genesis file and at least one log are readable.
- Seeding happens once, as events in the creator's log.
- Writes no person typed use ids derived from their content:
  `uuidv5(ledgerId, "<job>:<key>:<period>")`. Concurrent runs then dedupe.
  This replaces the SQL seed triggers and lazy system-account creation.
- The device (author) id is stored in device-local storage only. Each log
  file header carries a per-install `writerEpoch`. A device that finds
  lines it didn't write in its own file stops writing there and takes a
  new author id.

## Consequences

- No duplicate seeds or system accounts, and no double-posted recurring
  entries.
- A cloned device (backup restore, copied vault) is detected rather than
  silently sharing a file.
