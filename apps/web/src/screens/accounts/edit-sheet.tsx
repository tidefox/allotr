import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type { AccountView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { ColourField, IconField } from '@/components/style-fields';
import {
  accountEditDraft,
  toUpdateBody,
  type AccountEditDraft,
  type AccountEditErrors,
  type AccountUpdate,
} from '@/features/accounts/edit-draft';
import { call } from '@/lib/api';
import { endpoints } from '@/lib/endpoints';
import { reformatAmountInput } from '@/lib/amount-input';
import { t } from '@/messages/t';
import { TextField } from '../transactions/detail/fields.tsx';

const locale = 'en';

/**
 * Edits one account: its name, how it looks (a series colour and an icon, or
 * Auto) and, for a credit account, its limit and the day its payment is due.
 * The limit and due day are shown only; a due day creates no bill. The server
 * trims the name and refuses duplicates.
 */
export function EditSheet({
  account,
  onClose,
}: {
  account: AccountView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AccountEditDraft>(() =>
    accountEditDraft(account, locale),
  );
  const [errors, setErrors] = useState<AccountEditErrors>({});
  const credit = account.kind === 'liability';
  const save = useMutation({
    mutationFn: (body: AccountUpdate) =>
      call(endpoints.updateAccount, { params: { id: account.id }, body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
    },
  });

  const update = (patch: Partial<AccountEditDraft>) => {
    if (save.isError) save.reset();
    setDraft((current) => ({ ...current, ...patch }));
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = toUpdateBody(draft, account, locale);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (Object.keys(result.body).length === 0) {
      onClose();
      return;
    }
    save.mutate(result.body);
  };

  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('accountsScreen.rename.title', { name: account.name })}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <TextField
          label={t('accountsScreen.rename.name')}
          value={draft.name}
          onChange={(name) => {
            update({ name });
          }}
          error={errors.name === undefined ? undefined : t(errors.name)}
          autoFocus
        />
        <ColourField
          value={draft.colour}
          onChange={(colour) => {
            update({ colour });
          }}
        />
        <p className="font-sans text-small text-text-muted">
          {t('accountsScreen.edit.colourHint')}
        </p>
        <IconField
          value={draft.icon}
          colour={draft.colour}
          onChange={(icon) => {
            update({ icon });
          }}
        />
        {credit ? (
          <>
            <div
              onBlur={() => {
                update({
                  creditLimit: reformatAmountInput(
                    draft.creditLimit,
                    account.currency,
                    locale,
                  ),
                });
              }}
            >
              <TextField
                label={t('accountsScreen.edit.limit', {
                  currency: account.currency,
                })}
                value={draft.creditLimit}
                inputMode="decimal"
                onChange={(creditLimit) => {
                  update({ creditLimit });
                }}
                error={
                  errors.creditLimit === undefined
                    ? undefined
                    : t(errors.creditLimit)
                }
              />
            </div>
            <TextField
              label={t('accountsScreen.edit.dueDay')}
              value={draft.dueDay}
              inputMode="numeric"
              onChange={(dueDay) => {
                update({ dueDay });
              }}
              error={errors.dueDay === undefined ? undefined : t(errors.dueDay)}
            />
            <p className="-mt-2 font-sans text-small text-text-muted">
              {t('accountsScreen.edit.creditHint')}
            </p>
          </>
        ) : null}
        {save.isError ? (
          <p role="alert" className="text-small text-negative">
            {t('accountsScreen.rename.failed')}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('accountsScreen.cancel')}
          </BracketButton>
          <PrimaryButton type="submit" isDisabled={save.isPending}>
            {save.isPending
              ? t('accountsScreen.rename.saving')
              : t('accountsScreen.rename.save')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}
