# 0032. Local mode: an event log in the vault is the source of truth

- Status: Accepted
- Date: 2026-10-13

## Context

Some users want Allotr with no server, inside a notes vault they already
sync between devices with a tool they already use (a cloud drive,
peer-to-peer sync, the notes app's own sync service, git, WebDAV). Those tools sync whole files and differ
in how they handle conflicts: last writer wins, numbered copies, or
merged text. A SQLite file (plus WAL sidecars) loses or corrupts data
under every one of them as soon as two devices write while offline.

## Options

1. Sync the SQLite file. Rejected: whole-file last-writer-wins loses
   entries; WAL sidecars corrupt.
2. A CRDT database extension. Rejected: native builds per platform, none
   on mobile webviews, and generic row merge doesn't know ledger rules.
3. Per-device append-only event logs as files, folded into a local cache.

## Decision

Option 3. In local mode:

- The ledger is the fold of the **set of events** found in every file
  under the ledger folder, regardless of file names. Events dedupe by id.
- Each device appends only to its own files, `log/<author>/<yyyy-mm>.md`.
- The local SQLite database (WASM) is a disposable cache, never stored in
  the vault and never synced.
- Server mode stays and moves to the same model: the server also writes
  events and folds them through the same reducer, so there is one write
  path and every server test exercises it. Its event log lives in the
  database instead of files.

## Consequences

- Any tool that eventually delivers bytes works. Conflict copies hold
  duplicate events, so union-merging them does no harm.
- No locks: two offline devices can both spend the same daily amount. The
  merge reports it after the fact.
- Figures are only as fresh as the files that have arrived, so the UI
  shows when each device was last seen.
- Amends ADR 0004: in local mode there is no single writer and no WAL
  file; the SQLite database is a cache. Server mode keeps SQLite and WAL
  as the store for its event log and the cache.
