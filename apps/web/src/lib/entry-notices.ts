import type { EntryNotice } from '@allotr/shared';
import { useSyncExternalStore } from 'react';

// What an edit or a revert could not carry over to the entry it made (a
// withdrawal link that no longer fits, ADR 0038). They are said once, on
// the new entry's detail, until the user dismisses them or leaves the app.

const none: readonly EntryNotice[] = [];
let notices = new Map<string, readonly EntryNotice[]>();
const listeners = new Set<() => void>();

function emit(next: Map<string, readonly EntryNotice[]>) {
  notices = next;
  for (const listener of listeners) listener();
}

/** Remembers the notices an edit or revert returned for the new entry. */
export function postEntryNotices(
  entryId: string,
  posted: readonly EntryNotice[],
) {
  if (posted.length === 0) return;
  emit(new Map(notices).set(entryId, posted));
}

export function dismissEntryNotices(entryId: string) {
  if (!notices.has(entryId)) return;
  const next = new Map(notices);
  next.delete(entryId);
  emit(next);
}

export function useEntryNotices(entryId: string): readonly EntryNotice[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => notices.get(entryId) ?? none,
  );
}
