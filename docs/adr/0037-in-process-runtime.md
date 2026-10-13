# 0037. In-process runtime: restating "the server is the only writer" and ADR 0030

- Status: Accepted
- Date: 2026-10-13

## Context

In local mode there is no server process. The API, the store and the
projections run in the same webview as the UI. Architecture says "the
server is the only writer", and ADR 0030 says the web UI does no money
maths beyond display ratios and input aids.

## Decision

- The rule becomes: **the store is the only writer**, in either runtime.
  In local mode the Hono app runs in-process via `app.fetch`, and the UI
  still talks to it only through the API.
- ADR 0030 keeps its meaning: UI components compute no figures. Every
  figure comes from the API, wherever the API runs.
- Auth is bypassed in local mode, with one implicit user. Features that
  need a server (chat gateways, the MCP endpoint, background push) aren't
  available in local mode.

## Consequences

- The UI is the same code in both modes.
- The store code must be free of Node-only APIs (packages/store).
