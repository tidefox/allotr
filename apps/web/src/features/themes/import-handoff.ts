import type { ThemeDraft } from './draft.ts';

// An imported palette waiting for the editor: Appearance reads the file,
// then opens /settings/themes/new, which takes the draft once it commits. It lives in
// memory only, so a reload starts the editor afresh.

let pending: ThemeDraft | undefined;

export function handOffDraft(draft: ThemeDraft): void {
  pending = draft;
}

/**
 * The waiting draft, left in place: a render can be thrown away before it
 * commits (a lazy chunk or query suspending), and the retry must see it too.
 */
export function peekDraft(): ThemeDraft | undefined {
  return pending;
}

/** Drops the draft once the editor that took it has committed. */
export function clearDraft(): void {
  pending = undefined;
}
