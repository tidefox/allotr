import { useSyncExternalStore } from 'react';
import { hasApiTransport } from './embed.tsx';

// Whether the device says it has a connection. `navigator.onLine` can be
// true without a working network, so a failed request still counts as
// offline where it matters (NetworkError); false is reliable.

/** True only when the browser reports it is offline (Node has no onLine). */
export function isOffline(): boolean {
  // Embedded with an in-process API there is no network to lose.
  if (hasApiTransport()) return false;
  const status: { onLine?: boolean } = navigator;
  return status.onLine === false;
}

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => !isOffline());
}
