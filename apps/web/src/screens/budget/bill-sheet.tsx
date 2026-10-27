import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type {
  AccountView,
  BillView,
  CategoryView,
  CreateBillBody,
} from '@allotr/shared';
import { formatMoneyInput } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { amountExample } from '@/features/quick-entry/draft';
import { useCurrencyOptions } from '@/lib/currency-options';
import { accountsQuery, categoriesQuery } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import {
  billQueryKeys,
  createBill,
  deleteBill,
  updateBill,
} from '@/lib/settings';
import { t } from '@/messages/t';
import {
  accountChoicesFor,
  categoryChoicesFor,
} from '@/screens/transactions/detail/choices.ts';
import {
  ChoiceField,
  FormRow,
  TextField,
} from '@/screens/transactions/detail/fields.tsx';
import {
  defaultBillAccount,
  DUE_DAYS,
  toBillBody,
  type BillDraft,
  type BillErrors,
} from './bill-form-model.ts';

const locale = 'en';

/**
 * Creates a bill (`+ new › Bill`, the Bills tab's `[+ bill]`), or edits
 * `bill` when given.
 */
export function BillSheet({
  bill,
  onClose,
}: {
  bill?: BillView;
  onClose: () => void;
}) {
  const accounts = useQuery(accountsQuery).data?.accounts;
  const categories = useQuery(categoriesQuery).data?.categories;
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={bill ? t('billForm.editTitle') : t('billForm.title')}
      closeLabel={t('shell.command.close')}
    >
      {accounts === undefined || categories === undefined ? (
        <p role="status" className="px-3 py-4 text-small text-text-muted">
          {t('billForm.loading')}
        </p>
      ) : (
        <BillForm
          bill={bill}
          accounts={accounts}
          categories={categories}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function errorText(
  errors: BillErrors,
  field: keyof BillErrors,
  currency: string,
): string | undefined {
  switch (errors[field]) {
    case undefined:
      return undefined;
    case 'required':
      return field === 'name'
        ? t('billForm.errors.name')
        : t('settings.bills.errors.amountRequired');
    case 'account':
      return t('billForm.errors.account');
    case 'same':
      return t('billForm.errors.priceSame');
    case 'decimals':
      return t('settings.bills.errors.amountDecimals');
    case 'positive':
      return t('settings.bills.errors.amountPositive');
    default:
      return t('settings.bills.errors.amountInvalid', {
        example: amountExample(currency, locale),
      });
  }
}

function BillForm({
  bill,
  accounts,
  categories,
  onClose,
}: {
  bill: BillView | undefined;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<BillDraft>(
    bill
      ? {
          name: bill.name,
          accountId: bill.accountId,
          amount: formatMoneyInput(bill.amount, locale),
          dueDay: bill.dueDay,
          categoryId: bill.categoryId ?? '',
          priceCurrency: bill.price?.currency ?? '',
          price: bill.price ? formatMoneyInput(bill.price, locale) : '',
          active: bill.active,
        }
      : {
          name: '',
          accountId: defaultBillAccount(accounts),
          amount: '',
          dueDay: 1,
          categoryId: '',
          priceCurrency: '',
          price: '',
          active: true,
        },
  );
  const [errors, setErrors] = useState<BillErrors>({});
  const patch = (next: Partial<BillDraft>) => {
    setDraft((d) => ({ ...d, ...next }));
  };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currencyOptions = useCurrencyOptions(locale);
  const currency =
    accounts.find((a) => a.id === draft.accountId)?.currency ?? '';
  const save = useMutation({
    mutationFn: (body: CreateBillBody) =>
      bill
        ? updateBill(bill.id, {
            ...body,
            price: body.price ?? null,
            categoryId: body.categoryId ?? null,
            active: draft.active,
          })
        : createBill(body),
    onSuccess: () => {
      for (const queryKey of billQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteBill(bill?.id ?? ''),
    onSuccess: () => {
      for (const queryKey of billQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (save.isPending) return;
    const result = toBillBody(draft, accounts, locale);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(result.body);
  };

  const dayChoices = DUE_DAYS.map((day) => ({
    id: String(day),
    label: t('billForm.dueDayValue', { day }),
  }));

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={bill ? t('billForm.editTitle') : t('billForm.title')}
      className="flex flex-col gap-3 p-3"
    >
      <p className="font-sans text-small text-text-muted">
        {t('billForm.intro')}
      </p>
      <TextField
        label={t('settings.bills.name')}
        value={draft.name}
        onChange={(name) => {
          patch({ name });
        }}
        error={errorText(errors, 'name', currency)}
        autoFocus
      />
      <ChoiceField
        label={t('settings.bills.account')}
        value={draft.accountId}
        choices={accountChoicesFor(accounts, [])}
        placeholder={t('settings.bills.chooseAccount')}
        onChange={(accountId) => {
          patch({ accountId });
        }}
        error={errorText(errors, 'accountId', currency)}
      />
      <FormRow>
        <TextField
          label={t('settings.bills.amountIn', { currency })}
          value={draft.amount}
          inputMode="decimal"
          onChange={(amount) => {
            patch({ amount });
          }}
          error={errorText(errors, 'amount', currency)}
        />
        <ChoiceField
          label={t('settings.bills.dueDay')}
          value={String(draft.dueDay)}
          choices={dayChoices}
          placeholder=""
          onChange={(day) => {
            patch({ dueDay: Number(day) });
          }}
        />
      </FormRow>
      <ChoiceField
        label={t('billForm.category')}
        value={draft.categoryId}
        choices={categoryChoicesFor(categories, 'expense')}
        placeholder={t('billForm.noCategory')}
        onChange={(categoryId) => {
          patch({ categoryId });
        }}
      />
      <ChoiceField
        label={t('billForm.priceCurrency')}
        value={draft.priceCurrency === '' ? 'none' : draft.priceCurrency}
        choices={[
          { id: 'none', label: t('billForm.noPrice') },
          ...currencyOptions.map((o) => ({ id: o.code, label: o.label })),
        ]}
        placeholder={t('billForm.noPrice')}
        onChange={(priceCurrency) => {
          patch({
            priceCurrency: priceCurrency === 'none' ? '' : priceCurrency,
          });
        }}
      />
      {draft.priceCurrency === '' ? null : (
        <TextField
          label={t('billForm.priceIn', { currency: draft.priceCurrency })}
          value={draft.price}
          inputMode="decimal"
          onChange={(price) => {
            patch({ price });
          }}
          error={errorText(errors, 'price', draft.priceCurrency)}
        />
      )}
      {bill ? (
        <ChoiceField
          label={t('billForm.status')}
          value={draft.active ? 'on' : 'off'}
          choices={[
            { id: 'on', label: t('billForm.active') },
            { id: 'off', label: t('billForm.paused') },
          ]}
          placeholder=""
          onChange={(status) => {
            patch({ active: status === 'on' });
          }}
        />
      ) : null}
      {save.isError || remove.isError ? (
        <p role="alert" className="text-small text-negative">
          {describeProblem(save.error ?? remove.error).message}
        </p>
      ) : null}
      {confirmDelete ? (
        <div className="flex flex-col gap-2 border border-negative p-2">
          <p className="font-sans text-small">
            {t('billForm.deleteTitle', { name: bill?.name ?? '' })}{' '}
            <span className="text-text-muted">{t('billForm.deleteBody')}</span>
          </p>
          <div className="flex items-center justify-end gap-2">
            <BracketButton
              onPress={() => {
                setConfirmDelete(false);
              }}
            >
              {t('transactionDetail.edit.cancel')}
            </BracketButton>
            <PrimaryButton
              isDisabled={remove.isPending}
              onPress={() => {
                remove.mutate();
              }}
            >
              {remove.isPending
                ? t('billForm.deleting')
                : t('billForm.deleteAction')}
            </PrimaryButton>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {bill && !confirmDelete ? (
          <BracketButton
            onPress={() => {
              setConfirmDelete(true);
            }}
          >
            {t('billForm.delete')}
          </BracketButton>
        ) : null}
        <BracketButton onPress={onClose}>
          {t('transactionDetail.edit.cancel')}
        </BracketButton>
        <PrimaryButton type="submit" isDisabled={save.isPending}>
          {save.isPending
            ? t('billForm.saving')
            : bill
              ? t('billForm.saveEdit')
              : t('billForm.save')}
        </PrimaryButton>
      </div>
    </form>
  );
}
