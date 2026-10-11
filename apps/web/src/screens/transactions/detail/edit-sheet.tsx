import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type SyntheticEvent } from 'react';
import type {
  AccountView,
  CategoryView,
  TransactionView,
} from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import {
  isSplit,
  startSplit,
  toBody,
  type DraftErrorKey,
  type DraftField,
  type EntryKind,
  type QuickEntryDraft,
} from '@/features/quick-entry/draft';
import { draftFromEntry } from '@/features/ledger/edit-draft';
import { useSaveEntry } from '@/features/quick-entry/use-save-entry';
import { accountsQuery, categoriesQuery } from '@/lib/ledger';
import { randomId } from '@/lib/random-id';
import { t } from '@/messages/t';
import { EntryFields } from './entry-fields.tsx';

const locale = 'en';

/**
 * Edit, or split, one entry. It is the quick entry draft and request
 * builder on a sheet: an edit posts the old entry's reversal plus the new
 * one, and resolves to the new entry's ID.
 */
export function EditSheet({
  entry,
  split,
  onClose,
  onSaved,
}: {
  entry: TransactionView & { kind: EntryKind };
  /** Opens with the entry already split across categories. */
  split: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const loaded = accounts.data !== undefined && categories.data !== undefined;
  const title = split
    ? t('transactionDetail.edit.splitTitle')
    : t('transactionDetail.edit.title');
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      closeLabel={t('quickEntry.close')}
    >
      {loaded ? (
        <EditForm
          entry={entry}
          split={split}
          accounts={accounts.data.accounts}
          categories={categories.data.categories}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : (
        <p className="px-3 py-4 text-small text-text-muted">
          {t('quickEntry.loading')}
        </p>
      )}
    </Sheet>
  );
}

function EditForm({
  entry,
  split,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  entry: TransactionView & { kind: EntryKind };
  split: boolean;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [draft, setDraft] = useState<QuickEntryDraft>(() => {
    const base = draftFromEntry(entry, locale);
    return split && !isSplit(base) && base.kind !== 'transfer'
      ? startSplit(base)
      : base;
  });
  const [errors, setErrors] = useState<
    Partial<Record<DraftField, DraftErrorKey>>
  >({});
  const save = useSaveEntry(entry.id);
  const context = useMemo(() => ({ accounts, locale }), [accounts]);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = toBody(draft, context);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(
      { body: result.body, idempotencyKey: randomId() },
      { onSuccess: onSaved },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
      <EntryFields
        draft={draft}
        setDraft={setDraft}
        errors={errors}
        accounts={accounts}
        categories={categories}
        locale={locale}
      />
      {save.isError ? (
        <p role="alert" className="text-small text-negative">
          {t('transactionDetail.actionFailed')}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <BracketButton onPress={onClose}>
          {t('transactionDetail.edit.cancel')}
        </BracketButton>
        <PrimaryButton type="submit" isDisabled={save.isPending}>
          {save.isPending
            ? t('quickEntry.saving')
            : t('quickEntry.saveChanges')}
        </PrimaryButton>
      </div>
    </form>
  );
}
