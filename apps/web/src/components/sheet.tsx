import type { ReactNode } from 'react';
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
 */
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
  return (
    <ModalOverlay
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
