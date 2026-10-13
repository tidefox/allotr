// Replaces apps/server/src/http/entry-client.ts (which needs node:async_hooks).
// In the plugin every request comes from the web UI, so the client is a
// constant; no per-request state is needed.
import { type EntryClient, setClientProvider } from '@allotr/store';

setClientProvider(() => 'web');

export function withClient<T>(_client: EntryClient | null, work: () => T): T {
  return work();
}
