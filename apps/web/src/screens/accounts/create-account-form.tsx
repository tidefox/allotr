import { type AccountView, type LedgerSettingsView } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { PrimaryButton } from '@/components/buttons';
import {
  ACCOUNT_FIELD_ORDER,
  newAccountDraft,
  toCreateBody,
  type AccountDraft,
  type AccountDraftErrors,
} from '@/features/accounts/create-draft';
import { amountExample } from '@/features/quick-entry/draft';
import { ApiError } from '@/lib/api';
import { reformatAmountInput } from '@/lib/amount-input';
import { useCurrencyOptions } from '@/lib/currency-options';
import { createAccount, entryQueryKeys } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import { FormMessage } from '../auth/auth-fields.tsx';
import { ChoiceField, TextField } from '../transactions/detail/fields.tsx';

// The new-account form, shared by setup and the Accounts screen (FR-L2).
// The currency is fixed once the account exists; the server validates
// everything again.

export function CreateAccountForm({
  group,
  settings,
  today,
  autoFocus = false,
  onCreated,
  onBusyChange,
}: {
  /** Fixes the budget group and hides its choice. */
  group?: AccountView['budgetGroup'];
  autoFocus?: boolean;
  settings: LedgerSettingsView;
  today: string;
  onCreated: (account: AccountView) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AccountDraft>(() => ({
    ...newAccountDraft(settings.defaultCurrency, today),
    ...(group === undefined ? {} : { budgetGroup: group }),
  }));
  const [errors, setErrors] = useState<AccountDraftErrors>({});
  const [nameTaken, setNameTaken] = useState(false);
  const currencies = useCurrencyOptions(settings.locale);
  const create = useMutation({
    mutationFn: createAccount,
    // The opening balance is an entry: every view that shows money changes.
    onSuccess: async () => {
      await Promise.all(
        entryQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });

  const update = (patch: Partial<AccountDraft>) => {
    if (create.isError) create.reset();
    if (patch.name !== undefined) setNameTaken(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const errorText = (field: (typeof ACCOUNT_FIELD_ORDER)[number]) => {
    if (field === 'name' && nameTaken)
      return t('accounts.create.errors.nameTaken');
    const key = errors[field];
    if (key === undefined) return undefined;
    return key === 'accounts.create.errors.balanceInvalid'
      ? t(key, { example: amountExample(draft.currency, settings.locale) })
      : t(key);
  };

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (create.isPending) return;
    const result = toCreateBody(draft, settings.locale);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onBusyChange(true);
    create.mutate(result.body, {
      onSuccess: (account) => {
        onBusyChange(false);
        // A fresh form for the next account.
        setDraft({
          ...newAccountDraft(settings.defaultCurrency, today),
          budgetGroup: group ?? 'on',
        });
        onCreated(account);
      },
      onError: (error) => {
        onBusyChange(false);
        if (
          error instanceof ApiError &&
          error.problem.code === 'account_name_taken'
        ) {
          create.reset();
          setNameTaken(true);
        }
      },
    });
  }

  return (
    <form className="flex max-w-md flex-col gap-3" onSubmit={submit} noValidate>
      <TextField
        label={t('accounts.create.name')}
        value={draft.name}
        onChange={(name) => {
          update({ name });
        }}
        error={errorText('name')}
        autoFocus={autoFocus}
      />
      <ChoiceField
        label={t('accounts.create.currency')}
        value={draft.currency}
        choices={currencies.map((o) => ({ id: o.code, label: o.label }))}
        placeholder={draft.currency}
        onChange={(currency) => {
          update({ currency });
        }}
        error={errorText('currency')}
      />
      {group === undefined ? (
        <ChoiceField
          label={t('accounts.create.group')}
          value={draft.budgetGroup}
          choices={(['on', 'off'] as const).map((id) => ({
            id,
            label: t(`accountDetail.groups.${id}`),
          }))}
          placeholder={t('accountDetail.groups.on')}
          onChange={(budgetGroup) => {
            update({ budgetGroup: budgetGroup === 'off' ? 'off' : 'on' });
          }}
        />
      ) : null}
      <div
        onBlur={() => {
          update({
            openingBalance: reformatAmountInput(
              draft.openingBalance,
              draft.currency,
              settings.locale,
            ),
          });
        }}
      >
        <TextField
          label={t('accounts.create.balance', { currency: draft.currency })}
          value={draft.openingBalance}
          inputMode="decimal"
          onChange={(openingBalance) => {
            update({ openingBalance });
          }}
          error={errorText('openingBalance')}
        />
      </div>
      <p className="-mt-2 font-ui text-small text-text-muted">
        {t('accounts.create.balanceHint')}
      </p>
      <FormMessage
        message={create.isError ? describeProblem(create.error).message : null}
      />
      <div>
        <PrimaryButton type="submit" isDisabled={create.isPending}>
          {create.isPending
            ? t('accounts.create.saving')
            : t('accounts.create.save')}
        </PrimaryButton>
      </div>
    </form>
  );
}
