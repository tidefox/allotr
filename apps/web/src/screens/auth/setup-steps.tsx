import {
  paydayRules,
  type AccountView,
  type BillView,
  type LedgerSettingsView,
  type PaydayRule,
  type UpdateLedgerSettingsBody,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import {
  browserRegion,
  localeSample,
  timeZoneOptions,
} from '@/features/settings/region';
import {
  ACCOUNT_FIELD_ORDER,
  newAccountDraft,
  toCreateBody,
  type AccountDraft,
  type AccountDraftErrors,
} from '@/features/accounts/create-draft';
import {
  parseBillAmount,
  type AmountError,
} from '@/features/settings/bill-draft';
import { amountExample } from '@/features/quick-entry/draft';
import { ApiError } from '@/lib/api';
import { reformatAmountInput } from '@/lib/amount-input';
import { useCurrencyOptions } from '@/lib/currency-options';
import { formatMoney } from '@/lib/format-money';
import { createAccount, entryQueryKeys } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import {
  billQueryKeys,
  createBill,
  figureQueryKeys,
  invalidate,
  updateLedgerSettings,
} from '@/lib/settings';
import { t } from '@/messages/t';
import {
  ChoiceField,
  TextField,
} from '@/screens/transactions/detail/fields.tsx';
import { FormMessage } from './auth-fields.tsx';
import {
  isEmpty,
  MONTH_DAYS,
  paydayChanges,
  regionChanges,
} from './setup-model.ts';

// The steps of setup (FR-W7). Each saves through the same endpoints as
// Settings and Accounts, then calls `onNext`; `onSkip` moves on without
// saving.

export interface StepProps {
  busy: boolean;
  onNext: () => void;
  onSkip: () => void;
}

function Actions({
  busy,
  primary,
  onSkip,
}: {
  busy: boolean;
  /** A submit button for the step's form, or a plain button. */
  primary: { label: string; onPress?: () => void };
  onSkip?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PrimaryButton
        type={primary.onPress === undefined ? 'submit' : 'button'}
        isDisabled={busy}
        {...(primary.onPress === undefined ? {} : { onPress: primary.onPress })}
      >
        {busy ? t('setup.saving') : primary.label}
      </PrimaryButton>
      {onSkip === undefined ? null : (
        <BracketButton isDisabled={busy} onPress={onSkip}>
          {t('setup.skip')}
        </BracketButton>
      )}
    </div>
  );
}

function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateLedgerSettingsBody) => updateLedgerSettings(body),
    onSuccess: async () => {
      await invalidate(queryClient, figureQueryKeys);
    },
  });
}

export function RegionStep({
  settings,
  busy,
  onNext,
  onSkip,
  detect,
}: StepProps & { settings: LedgerSettingsView; detect: boolean }) {
  // New users start at UTC and en-US; this device knows better. Coming
  // back to the step, the saved choice wins.
  const [detected] = useState<ReturnType<typeof browserRegion>>(() =>
    detect ? browserRegion() : {},
  );
  const [locale, setLocale] = useState(detected.locale ?? settings.locale);
  const [timeZone, setTimeZone] = useState(
    detected.timeZone ?? settings.timeZone,
  );
  const [currency, setCurrency] = useState<string>(settings.defaultCurrency);
  const zones = useMemo(() => timeZoneOptions(timeZone), [timeZone]);
  const currencies = useCurrencyOptions(settings.locale);
  const save = useSaveSettings();
  const problem = save.isError ? describeProblem(save.error) : null;
  const example = localeSample(locale.trim(), currency);
  const reset = () => {
    if (save.isError) save.reset();
  };

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = regionChanges(settings, {
      locale: locale.trim(),
      timeZone,
      defaultCurrency: currency,
    });
    if (isEmpty(body)) {
      onNext();
      return;
    }
    save.mutate(body, { onSuccess: onNext });
  }

  return (
    <form className="flex max-w-md flex-col gap-3" onSubmit={submit} noValidate>
      <ChoiceField
        label={t('settings.ledger.currency')}
        value={currency}
        choices={currencies.map((o) => ({ id: o.code, label: o.label }))}
        placeholder={t('accounts.create.errors.currencyRequired')}
        onChange={(id) => {
          setCurrency(id);
          reset();
        }}
        error={problem?.fields.defaultCurrency}
      />
      <p className="-mt-2 font-ui text-small text-text-muted">
        {t('settings.ledger.currencyHint')}
      </p>
      <ChoiceField
        label={t('settings.ledger.timeZone')}
        value={timeZone}
        choices={zones.map((zone) => ({ id: zone, label: zone }))}
        placeholder={timeZone}
        onChange={(id) => {
          setTimeZone(id);
          reset();
        }}
        error={problem?.fields.timeZone}
      />
      <TextField
        label={t('settings.ledger.locale')}
        value={locale}
        onChange={(next) => {
          setLocale(next);
          reset();
        }}
        error={problem?.fields.locale}
      />
      <p className="-mt-2 font-ui text-small text-text-muted">
        {example === null
          ? t('settings.ledger.localeUnknown')
          : t('settings.ledger.localeSample', { sample: example })}
      </p>
      <FormMessage message={problem?.message ?? null} />
      <Actions
        busy={busy || save.isPending}
        primary={{ label: t('setup.continue') }}
        onSkip={onSkip}
      />
    </form>
  );
}

const dayChoices = MONTH_DAYS.map((n) => ({ id: String(n), label: String(n) }));

export function PaydayStep({
  settings,
  busy,
  onNext,
  onSkip,
}: StepProps & { settings: LedgerSettingsView }) {
  const [rule, setRule] = useState<PaydayRule>(settings.paydayRule);
  const [day, setDay] = useState(settings.paydayDay);
  const save = useSaveSettings();
  const problem = save.isError ? describeProblem(save.error) : null;
  const reset = () => {
    if (save.isError) save.reset();
  };

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = paydayChanges(settings, rule, day);
    if (isEmpty(body)) {
      onNext();
      return;
    }
    save.mutate(body, { onSuccess: onNext });
  }

  return (
    <form className="flex max-w-md flex-col gap-3" onSubmit={submit} noValidate>
      <ChoiceField
        label={t('settings.payday.rule')}
        value={rule}
        choices={paydayRules.map((r) => ({
          id: r,
          label: t(`settings.payday.rules.${r}`),
        }))}
        placeholder={t('settings.payday.rule')}
        onChange={(id) => {
          const next = paydayRules.find((r) => r === id);
          if (next !== undefined) setRule(next);
          reset();
        }}
      />
      <p className="-mt-2 font-ui text-small text-text-muted">
        {t(`settings.payday.ruleHint.${rule}`)}
      </p>
      {rule === 'last-working-day' ? null : (
        <>
          <ChoiceField
            label={
              rule === 'manual'
                ? t('settings.payday.dayManual')
                : t('settings.payday.day')
            }
            value={String(day)}
            choices={dayChoices}
            placeholder={String(day)}
            onChange={(id) => {
              setDay(Number(id));
              reset();
            }}
            error={problem?.fields.paydayDay}
          />
          <p className="-mt-2 font-ui text-small text-text-muted">
            {t('settings.payday.dayHint')}
          </p>
        </>
      )}
      <FormMessage message={problem?.message ?? null} />
      <Actions
        busy={busy || save.isPending}
        primary={{ label: t('setup.continue') }}
        onSkip={onSkip}
      />
    </form>
  );
}

/** What the step has added so far: one line each. */
function AddedList({ items }: { items: readonly [string, ReactNode][] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={t('setup.added')}>
      <h3 className="mb-1 text-small text-text-muted">{t('setup.added')}</h3>
      <ul className="border-t">
        {items.map(([key, content]) => (
          <li
            key={key}
            className="flex min-h-row items-center justify-between gap-3 border-b text-small"
          >
            {content}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Next without saving anything when nothing was added, so an empty step
 * reads as skipped.
 */
function Next({
  busy,
  added,
  last,
  onNext,
  onSkip,
}: StepProps & { added: boolean; last?: boolean }) {
  return (
    <Actions
      busy={busy}
      primary={
        added || last === true
          ? {
              label: last === true ? t('setup.finish') : t('setup.continue'),
              onPress: onNext,
            }
          : { label: t('setup.skip'), onPress: onSkip }
      }
    />
  );
}

function AccountForm({
  group,
  settings,
  today,
  onCreated,
  onBusyChange,
}: {
  group: AccountView['budgetGroup'];
  settings: LedgerSettingsView;
  today: string;
  onCreated: (account: AccountView) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AccountDraft>(() => ({
    ...newAccountDraft(settings.defaultCurrency, today),
    budgetGroup: group,
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
          budgetGroup: group,
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

export function AccountsStep({
  group,
  accounts,
  settings,
  today,
  busy,
  onNext,
  onSkip,
  onAnnounce,
}: StepProps & {
  group: AccountView['budgetGroup'];
  accounts: readonly AccountView[];
  settings: LedgerSettingsView;
  today: string;
  onAnnounce: (message: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const mine = accounts.filter((a) => a.budgetGroup === group && !a.archived);

  return (
    <div className="flex flex-col gap-3">
      <AddedList
        items={mine.map((a) => [
          a.id,
          <>
            <span className="min-w-0 truncate font-ui">{a.name}</span>
            <span className="num shrink-0">
              {formatMoney(a.balance, 'symbol', settings.locale)}
            </span>
          </>,
        ])}
      />
      <AccountForm
        group={group}
        settings={settings}
        today={today}
        onBusyChange={setCreating}
        onCreated={(account) => {
          onAnnounce(t('setup.announceAdded', { name: account.name }));
        }}
      />
      <Next
        busy={busy || creating}
        added={mine.length > 0}
        onNext={onNext}
        onSkip={onSkip}
      />
    </div>
  );
}

function amountErrorText(
  error: AmountError,
  currency: string,
  locale: string,
): string {
  switch (error) {
    case 'required':
      return t('settings.bills.errors.amountRequired');
    case 'decimals':
      return t('settings.bills.errors.amountDecimals');
    case 'positive':
      return t('settings.bills.errors.amountPositive');
    case 'invalid':
      return t('settings.bills.errors.amountInvalid', {
        example: amountExample(currency, locale),
      });
  }
}

function BillForm({
  accounts,
  locale,
  onDone,
  onBusyChange,
}: {
  accounts: readonly AccountView[];
  locale: string;
  onDone: (name: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const open = accounts.filter((a) => !a.archived);
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(
    open.find((a) => a.budgetGroup === 'on')?.id ?? open[0]?.id ?? '',
  );
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState(1);
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({});
  const currency = open.find((a) => a.id === accountId)?.currency ?? '';
  const save = useMutation({
    mutationFn: createBill,
    onSuccess: async () => {
      await invalidate(queryClient, billQueryKeys);
    },
  });
  const problem = save.isError ? describeProblem(save.error) : null;

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (save.isPending) return;
    const parsed = parseBillAmount(amount, currency, locale);
    const next = {
      ...(name.trim() === ''
        ? { name: t('accounts.create.errors.nameRequired') }
        : {}),
      ...(parsed.ok
        ? {}
        : { amount: amountErrorText(parsed.error, currency, locale) }),
    };
    setErrors(next);
    if (!parsed.ok || next.name !== undefined) return;
    onBusyChange(true);
    save.mutate(
      { name: name.trim(), accountId, amount: parsed.amount, dueDay },
      {
        onSuccess: (saved) => {
          onBusyChange(false);
          setName('');
          setAmount('');
          onDone(saved.name);
        },
        onError: () => {
          onBusyChange(false);
        },
      },
    );
  }

  return (
    <form className="flex max-w-md flex-col gap-3" onSubmit={submit} noValidate>
      <TextField
        label={t('settings.bills.name')}
        value={name}
        onChange={(next) => {
          setName(next);
          if (save.isError) save.reset();
        }}
        error={errors.name ?? problem?.fields.name}
      />
      <ChoiceField
        label={t('settings.bills.account')}
        value={accountId}
        choices={open.map((a) => ({ id: a.id, label: a.name }))}
        placeholder={t('settings.bills.chooseAccount')}
        onChange={setAccountId}
      />
      <TextField
        label={
          currency === ''
            ? t('settings.bills.amount')
            : t('settings.bills.amountIn', { currency })
        }
        value={amount}
        inputMode="decimal"
        onChange={setAmount}
        error={errors.amount}
      />
      <ChoiceField
        label={t('settings.bills.dueDay')}
        value={String(dueDay)}
        choices={dayChoices}
        placeholder={String(dueDay)}
        onChange={(id) => {
          setDueDay(Number(id));
        }}
      />
      <FormMessage message={problem?.message ?? null} />
      <div>
        <PrimaryButton type="submit" isDisabled={save.isPending}>
          {t('settings.bills.addSubmit')}
        </PrimaryButton>
      </div>
    </form>
  );
}

export function BillsStep({
  bills,
  accounts,
  locale,
  busy,
  onNext,
  onSkip,
  onAnnounce,
}: StepProps & {
  bills: readonly BillView[];
  accounts: readonly AccountView[];
  locale: string;
  onAnnounce: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const hasAccounts = accounts.some((a) => !a.archived);

  return (
    <div className="flex flex-col gap-3">
      <AddedList
        items={bills.map((bill) => [
          bill.id,
          <>
            <span className="min-w-0 truncate font-ui">{bill.name}</span>
            <span className="num shrink-0">
              {formatMoney(bill.amount, 'symbol', locale)}
            </span>
          </>,
        ])}
      />
      {hasAccounts ? (
        <BillForm
          accounts={accounts}
          locale={locale}
          onBusyChange={setSaving}
          onDone={(name) => {
            onAnnounce(t('setup.announceAdded', { name }));
          }}
        />
      ) : (
        <p className="font-ui text-small text-text-muted">
          {t('setup.bills.noAccounts')}
        </p>
      )}
      <Next
        busy={busy || saving}
        added={bills.length > 0}
        last
        onNext={onNext}
        onSkip={onSkip}
      />
    </div>
  );
}
