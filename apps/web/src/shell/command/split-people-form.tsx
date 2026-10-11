import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type SyntheticEvent } from 'react';
import type { AccountView, CategoryView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import {
  emptyPerson,
  fillEven,
  positive,
  toSplitBody,
  type PersonDraft,
  type PersonError,
} from '@/features/ious/draft';
import {
  toBody,
  type DraftErrors,
  type QuickEntryDraft,
} from '@/features/quick-entry/draft';
import { readLastUsed, rememberChoice } from '@/features/quick-entry/last-used';
import {
  draftForForm,
  type FormPreset,
} from '@/features/quick-entry/new-draft';
import { entryQueryKeys } from '@/lib/ledger';
import { createIou, iouQueryKeys } from '@/lib/ious';
import { describeProblem } from '@/lib/problem';
import { randomId } from '@/lib/random-id';
import { t } from '@/messages/t';
import { EntryFields } from '@/screens/transactions/detail/entry-fields.tsx';
import { PeopleEditor } from '@/screens/transactions/detail/people-editor.tsx';
import { loggedFromTransaction } from './logged.ts';
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
 * + new › Split with people: a new expense shared with people. The amount is
 * the whole bill the account paid; each person owes an even share until
 * their amount is typed, and the server keeps the rest as the user's own
 * share (refusing when people owe more than the bill). Saves as one IOU
 * request, so a repeated key returns what the first try made.
 */
export function SplitPeopleForm({
  preset,
  accounts,
  categories,
  today,
}: {
  preset: FormPreset;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  today: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<QuickEntryDraft>(() =>
    draftForForm(
      'split',
      { accounts, categories, today, lastUsed: readLastUsed(storage()) },
      preset,
    ),
  );
  const [people, setPeople] = useState<readonly PersonDraft[]>([emptyPerson]);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [personErrors, setPersonErrors] = useState<
    Readonly<Record<number, PersonError>>
  >({});
  const [exceeds, setExceeds] = useState(false);
  const key = useRef<{ fingerprint: string; key: string } | null>(null);
  const context = useMemo(() => ({ accounts, locale }), [accounts]);
  const account = accounts.find((a) => a.id === draft.accountId);
  const currency = account?.currency ?? '';
  const bill = positive(draft.amount, currency, locale);

  const save = useMutation({
    mutationFn: (request: {
      body: Parameters<typeof createIou>[0];
      idempotencyKey: string;
    }) => createIou(request.body, request.idempotencyKey),
    onSuccess: (created) => {
      key.current = null;
      for (const queryKey of [...entryQueryKeys, ...iouQueryKeys])
        void queryClient.invalidateQueries({ queryKey });
      rememberChoice(storage(), draft);
      closeNewForm();
      const logged = loggedFromTransaction(
        created.transaction,
        accounts,
        categories,
      );
      if (logged !== null) showLogged(logged);
    },
  });

  const edit = (next: () => void) => {
    if (save.isError) save.reset();
    setExceeds(false);
    next();
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (save.isPending) return;
    const expense = toBody(draft, context);
    if (!expense.ok) {
      setErrors(expense.errors);
      setPersonErrors({});
      return;
    }
    setErrors({});
    const built = toSplitBody(
      expense.body,
      fillEven(people, bill, locale),
      locale,
    );
    if (!built.ok) {
      setPersonErrors(built.errors);
      setExceeds(built.total === 'exceeds');
      return;
    }
    setPersonErrors({});
    setExceeds(false);
    const fingerprint = JSON.stringify(built.body);
    key.current =
      key.current?.fingerprint === fingerprint
        ? key.current
        : { fingerprint, key: randomId() };
    save.mutate({ body: built.body, idempotencyKey: key.current.key });
  };

  const label = t('shell.command.kinds.split');
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={label}
      className="flex flex-col gap-3 p-3"
    >
      <p className="font-sans text-small text-text-muted">
        {t('shell.command.splitPeople.intro')}
      </p>
      <EntryFields
        draft={draft}
        setDraft={(next) => {
          edit(() => {
            setDraft(next);
          });
        }}
        errors={errors}
        accounts={accounts}
        categories={categories}
        locale={locale}
        withPeople
      />
      <PeopleEditor
        people={people}
        bill={bill}
        currency={currency}
        locale={locale}
        errors={personErrors}
        onChange={(next) => {
          edit(() => {
            setPeople(next);
          });
        }}
      />
      {exceeds ? (
        <p role="alert" className="text-small text-negative">
          {t('shell.command.splitPeople.exceeds')}
        </p>
      ) : null}
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
