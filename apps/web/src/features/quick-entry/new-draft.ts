import type { QuickEntryDraft } from './draft.ts';
import { newDraft, switchKind, type DraftDefaults } from './options.ts';

// The draft a + new form opens with. A split (with people) starts as a plain
// expense, and the people are collected next to it; the "into" account of the command line and a transfer's source
// from "transfer from here" override what was used last.

export const ENTRY_FORM_KINDS = [
  'expense',
  'income',
  'transfer',
  'split',
] as const;
export type EntryFormKind = (typeof ENTRY_FORM_KINDS)[number];

export function isEntryFormKind(kind: string): kind is EntryFormKind {
  return (ENTRY_FORM_KINDS as readonly string[]).includes(kind);
}

export interface FormPreset {
  /** A transfer's source account. */
  readonly fromAccountId?: string | undefined;
  /** The command line's "into" account, for expenses and income. */
  readonly intoAccountId?: string | null | undefined;
}

export function draftForForm(
  kind: EntryFormKind,
  defaults: DraftDefaults,
  preset: FormPreset = {},
): QuickEntryDraft {
  const base = newDraft(defaults);
  const entryKind = kind === 'split' ? 'expense' : kind;
  const draft =
    entryKind === 'expense' ? base : switchKind(base, entryKind, defaults);
  const open = defaults.accounts.filter((a) => !a.archived).map((a) => a.id);
  const wanted =
    entryKind === 'transfer' ? preset.fromAccountId : preset.intoAccountId;
  const accountId =
    wanted != null && open.includes(wanted) ? wanted : draft.accountId;
  let toAccountId = draft.toAccountId;
  if (entryKind === 'transfer' && toAccountId === accountId)
    toAccountId = open.find((id) => id !== accountId) ?? '';
  return { ...draft, accountId, toAccountId };
}
