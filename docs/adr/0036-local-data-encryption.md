# 0036. Encryption of local-mode data

- Status: Accepted
- Date: 2026-10-13

## Context

In local mode, ledger files live in the user's vault and travel through
whatever sync service they use. ADR 0015 keeps the server database in
plaintext and relies on disk encryption. Every plugin in the host app
shares one origin, so encryption can't protect against another plugin.
The realistic extra risk is a vault published by mistake (pushed to a
public repository or a publishing service).

## Decision

- v1 stores events in plaintext.
- Setup recommends device disk encryption and the sync provider's
  end-to-end option where there is one. It warns when the vault looks
  published or tracked by git with a remote.
- The event envelope reserves `enc` so opt-in per-line encryption
  (AES-GCM, with a key derived from a passphrase) can be added later
  without changing the format.

## Consequences

- Readable files make it possible to debug sync problems and to query the
  data with other tools.
- A user who publishes their vault exposes their ledger. The warning and
  the docs say so plainly.
