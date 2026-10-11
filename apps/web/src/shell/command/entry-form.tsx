import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type SyntheticEvent } from 'react';
import type {
  AccountView,
  CategoryView,
  CreateTransactionBody,
} from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import {
  keyForBody,
  toBody,
  type DraftErrors,
  type DraftKey,
  type QuickEntryDraft,
} from '@/features/quick-entry/draft';
import { readLastUsed, rememberChoice } from '@/features/quick-entry/last-used';
import {
  draftForForm,
  type EntryFormKind,
  type FormPreset,
} from '@/features/quick-entry/new-draft';
import {
  accountsQuery,
  categoriesQuery,
  createTransaction,
  entryQueryKeys,
  todayQuery,
} from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import { randomId } from '@/lib/random-id';
import { t } from '@/messages/t';
import { EntryFields } from '@/screens/transactions/detail/entry-fields.tsx';
import { loggedFromTransaction } from './logged.ts';
import { SplitPeopleForm } from './split-people-form.tsx';
import { closeNewForm, showLogged } from './store.ts';

const locale = 'en';

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The structured + new forms for an expense, income or transfer, and a split
 * with people (docs/ui.md §3): a sheet over the quick entry draft. On save the entry
 * shows in the command line's result line with an undo.
 */
export function EntryFormSheet({
  kind,
  preset,
  intoAccountId,
}: {
  kind: EntryFormKind;
  preset: FormPreset;
  intoAccountId: string | null;
}) {
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const today = useQuery(todayQuery);
  const ready =
    accounts.data !== undefined &&
    categories.data !== undefined &&
    today.data !== undefined;
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) closeNewForm();
      }}
      title={t(`shell.command.kinds.${kind}`)}
      closeLabel={t('shell.command.close')}
    >
      {ready && kind === 'split' ? (
        <SplitPeopleForm
          preset={{ intoAccountId, ...preset }}
          accounts={accounts.data.accounts}
          categories={categories.data.categories}
          today={today.data.today}
        />
      ) : ready ? (
        <EntryForm
          kind={kind}
          preset={{ intoAccountId, ...preset }}
          accounts={accounts.data.accounts}
          categories={categories.data.categories}
          today={today.data.today}
        />
      ) : (
        <p role="status" className="px-3 py-4 text-small text-text-muted">
          {t('quickEntry.loading')}
        </p>
      )}
    </Sheet>
  );
}

function EntryForm({
  kind,
  preset,
  accounts,
  categories,
  today,
}: {
  kind: EntryFormKind;
  preset: FormPreset;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  today: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<QuickEntryDraft>(() =>
    draftForForm(
      kind,
      { accounts, categories, today, lastUsed: readLastUsed(storage()) },
      preset,
    ),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const key = useRef<DraftKey | null>(null);
  const context = useMemo(() => ({ accounts, locale }), [accounts]);

  const save = useMutation({
    mutationFn: (request: {
      body: CreateTransactionBody;
      idempotencyKey: string;
    }) => createTransaction(request.body, request.idempotencyKey),
    onSuccess: (created) => {
      key.current = null;
      for (const queryKey of entryQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      rememberChoice(storage(), draft);
      closeNewForm();
      const logged = loggedFromTransaction(created, accounts, categories);
      if (logged !== null) showLogged(logged);
    },
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = toBody(draft, context);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    key.current = keyForBody(key.current, result.body, randomId);
    save.mutate({ body: result.body, idempotencyKey: key.current.key });
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={t(`shell.command.kinds.${kind}`)}
      className="flex flex-col gap-3 p-3"
    >
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
          {describeProblem(save.error).message}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <BracketButton onPress={closeNewForm}>
          {t('transactionDetail.edit.cancel')}
        </BracketButton>
        <PrimaryButton type="submit" isDisabled={save.isPending}>
          {save.isPending ? t('quickEntry.saving') : t('quickEntry.save')}
        </PrimaryButton>
      </div>
    </form>
  );
}
