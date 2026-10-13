# 0035. Event schema versioning and read-only on version skew

- Status: Accepted
- Date: 2026-10-13

## Context

Devices update the app at different times. A device that folds events it
doesn't understand computes wrong figures and may write on top of them.
Forward-only SQL migrations (ADR 0004) can't reach other devices' files.

## Decision

- Every event has a `schema` number. Upcasters turn old events into the
  current shape when read; files are never rewritten.
- A device that finds an event newer than it supports becomes read-only
  and asks the user to update.
- SQL migrations remain for the local cache only, which can always be
  rebuilt from the logs.
- Golden event files per schema version are kept in `testdata/`.

## Consequences

- Old events stay valid forever, so upcasters are permanent code.
- During a rollout, a device on the old version can only read the ledger.
