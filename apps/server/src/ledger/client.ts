// Which kind of client is behind the request being served. Entries written
// for an API caller record it, so the ledger can later say "added in the
// app" or "added by chat" (migration 0018). It is a claim the caller makes
// about itself, shown to the user for information and never used to decide
// what is allowed.
//
// The ledger asks a provider for the client instead of holding request state
// itself, so it stays free of Node-only APIs. The HTTP layer installs a
// provider scoped to the request (http/entry-client.ts); without one, entries
// record no client.

export type EntryClient = 'web' | 'chat';

export const CLIENT_HEADER = 'x-allotr-client';

export type ClientProvider = () => EntryClient | null;

let provider: ClientProvider = () => null;

/** Installs the source of the current request's client. */
export function setClientProvider(next: ClientProvider): void {
  provider = next;
}

/** The client a header value names; anything else is a plain API caller. */
export function parseClient(value: string | undefined): EntryClient | null {
  const name = value?.trim().toLowerCase();
  return name === 'web' || name === 'chat' ? name : null;
}

export function currentClient(): EntryClient | null {
  return provider();
}
