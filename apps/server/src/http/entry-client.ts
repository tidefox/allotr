import { AsyncLocalStorage } from 'node:async_hooks';
import { type EntryClient, setClientProvider } from '../ledger/client.ts';

// Keeps the client of each request apart while requests interleave: the value
// lives in async-local storage, so work started by one request never sees
// another's.
const store = new AsyncLocalStorage<EntryClient>();

setClientProvider(() => store.getStore() ?? null);

/** Runs `work` with `client` recorded on every entry it appends. */
export function withClient<T>(client: EntryClient | null, work: () => T): T {
  return client === null ? work() : store.run(client, work);
}
