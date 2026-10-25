import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { IconCloseLine } from '@/generated/icons';
import { cn } from '@/lib/utils';

/**
 * A bottom sheet on `chrome` with a 2 px `primary` top edge, up to 84 % of
 * the height (docs/ui.md §4). The page behind is dimmed by a
 * `backdrop-filter: brightness()` on the overlay (docs/ui.md §2.1): a filter
 * on what is behind, never a translucent surface. The slide and the dim
 * share one ease-in-out token pair (`--ease-sheet`, `--dur-sheet`) on enter
 * and on exit; React Aria keeps the overlay mounted while `data-exiting`
 * animations run.
 *
 * Most screens mount a sheet only while it is open (`isOpen` stays true and
 * the parent drops it), so there is no state change for React Aria to
 * animate. A sheet removed while open therefore leaves an inert copy of its
 * overlay that plays the same exit and then removes itself (`leaveGhost`).
 */
const GHOST_FALLBACK_MS = 800;

/**
 * An inert, id-less copy of an overlay that is being removed while open. It
 * carries `data-exiting`, so the same CSS plays the exit; it goes away when
 * that animation ends (or after a fallback, if none runs).
 */
function leaveGhost(overlay: HTMLElement): HTMLElement {
  const ghost = overlay.cloneNode(true) as HTMLElement;
  for (const node of [ghost, ...ghost.querySelectorAll('.sheet-panel')]) {
    node.removeAttribute('data-entering');
    node.setAttribute('data-exiting', 'true');
  }
  for (const node of ghost.querySelectorAll('[id]')) node.removeAttribute('id');
  ghost.setAttribute('inert', '');
  ghost.setAttribute('aria-hidden', 'true');
  const remove = () => {
    ghost.remove();
  };
  ghost.addEventListener('animationend', (event) => {
    if (event.target === ghost) remove();
  });
  window.setTimeout(remove, GHOST_FALLBACK_MS);
  document.body.append(ghost);
  return ghost;
}

export function Sheet({
  isOpen,
  onOpenChange,
  title,
  closeLabel = 'Close',
  className,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  closeLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const ghost = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // Effects run twice at once in development: drop the copy of the first
    // simulated removal.
    ghost.current?.remove();
    ghost.current = null;
    return () => {
      // Skip a sheet that is gone already, or leaving through React Aria's
      // own exit (a sheet whose `isOpen` turned false).
      if (overlay === null || !overlay.isConnected) return;
      if (overlay.hasAttribute('data-exiting')) return;
      ghost.current = leaveGhost(overlay);
    };
  }, [overlay]);
  return (
    <ModalOverlay
      ref={setOverlay}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center"
    >
      <Modal className="sheet-panel w-full max-w-[34rem]">
        <Dialog
          aria-label={title ?? 'Sheet'}
          className={cn(
            'flex max-h-[84dvh] flex-col border-t-2 border-t-primary bg-chrome text-text outline-none',
            className,
          )}
        >
          <div className="flex h-bar shrink-0 items-center gap-2 border-b px-3">
            {title === undefined ? null : (
              <Heading
                slot="title"
                className="min-w-0 flex-1 truncate text-base font-semibold"
              >
                {title}
              </Heading>
            )}
            <button
              type="button"
              aria-label={closeLabel}
              onClick={() => {
                onOpenChange(false);
              }}
              className="press ml-auto flex size-hit items-center justify-center"
            >
              <IconCloseLine className="size-4" />
            </button>
          </div>
          <div className="scroll min-h-0 flex-1">
            {/* A sheet is its own frame: its content answers to its width. */}
            <div className="frame">
              <div className="scale">{children}</div>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
