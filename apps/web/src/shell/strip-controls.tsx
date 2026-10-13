import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEmbed } from '@/lib/embed.tsx';

// A screen's own controls (search, period, filter) render into the title
// strip's `#strip-controls` slot (docs/ui.md §3), whatever the screen's own
// tree looks like.

const noSubscription = () => () => undefined;

export function StripControls({ children }: { children: ReactNode }) {
  // The slot is part of the shell, which renders in the same commit as the
  // screen, so the first snapshot is empty and React re-reads it afterwards.
  // Embedded in a shadow root, the slot is looked up there, not in `document`.
  const root = useEmbed().root ?? document;
  const target = useSyncExternalStore(
    noSubscription,
    () => root.getElementById('strip-controls'),
    () => null,
  );
  return target === null ? null : createPortal(children, target);
}
