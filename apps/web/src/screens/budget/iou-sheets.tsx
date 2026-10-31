import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import {
  formatMoneyInput,
  isLocalDate,
  localDate,
  type AccountView,
  type CategoryView,
  type IouDirectionView,
  type IouView,
  type LocalDate,
} from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import {
  parseEntryDate,
  positive,
  toLoanBody,
  type DateError,
  type PersonError,
} from '@/features/ious/draft';
import { formatLongDay } from '@/features/ledger/format';
import { amountExample } from '@/features/quick-entry/draft';
import { formatMoney } from '@/lib/format-money';
import { ApiError } from '@/lib/api';
import {
  accountsQuery,
  categoriesQuery,
  reverseTransaction,
  todayQuery,
} from '@/lib/ledger';
import {
  allIousQuery,
  createIou,
  iouQueryKeys,
  repayIous,
  updateIou,
  writeOffIou,
} from '@/lib/ious';
import { describeProblem } from '@/lib/problem';
import { randomId } from '@/lib/random-id';
import { t } from '@/messages/t';
import {
  accountChoicesFor,
  categoryChoicesFor,
} from '@/screens/transactions/detail/choices.ts';
import {
  ChoiceField,
  TextField,
} from '@/screens/transactions/detail/fields.tsx';

const locale = 'en';

/** What the server made for a new loan: the entry and its IOUs. */
export type CreatedIous = Awaited<ReturnType<typeof createIou>>;

export type IouFlow =
  | Readonly<{ kind: 'loan'; direction?: IouDirectionView }>
  | Readonly<{ kind: 'repay' | 'writeoff' | 'due' | 'delete'; iou: IouView }>;

function titleOf(flow: IouFlow): string {
  switch (flow.kind) {
    case 'loan':
      return t('budgetGoalsIous.ious.sheets.loan');
    case 'repay':
      return flow.iou.direction === 'owed-to-me'
        ? t('budgetGoalsIous.ious.sheets.repay', { person: flow.iou.person })
        : t('budgetGoalsIous.ious.sheets.payBack', { person: flow.iou.person });
    case 'writeoff':
      return t('budgetGoalsIous.ious.sheets.writeOff', {
        person: flow.iou.person,
      });
    case 'due':
      return t('budgetGoalsIous.ious.sheets.due', { person: flow.iou.person });
    case 'delete':
      return t('budgetGoalsIous.ious.sheets.delete', {
        person: flow.iou.person,
      });
  }
}

/** One sheet for the IOU forms: new, repay, write off and due date. */
export function IouSheet({
  flow,
  onClose,
  onRecorded,
}: {
  flow: IouFlow | null;
  onClose: () => void;
  /** A new loan or borrow was recorded: the entry the server made. */
  onRecorded?: (created: CreatedIous) => void;
}) {
  return (
    <Sheet
      isOpen={flow !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={flow === null ? '' : titleOf(flow)}
      closeLabel={t('budgetGoalsIous.close')}
    >
      {flow === null ? null : (
        <Forms flow={flow} onClose={onClose} onRecorded={onRecorded} />
      )}
    </Sheet>
  );
}

function Forms({
  flow,
  onClose,
  onRecorded,
}: {
  flow: IouFlow;
  onClose: () => void;
  onRecorded: ((created: CreatedIous) => void) | undefined;
}) {
  const today = useQuery(todayQuery).data?.today;
  const accounts = useQuery(accountsQuery).data?.accounts;
  const categories = useQuery(categoriesQuery).data?.categories;
  if (today === undefined || accounts === undefined || categories === undefined)
    return (
      <p role="status" className="px-3 py-4 text-small text-text-muted">
        {t('budgetGoalsIous.payday.loading')}
      </p>
    );
  switch (flow.kind) {
    case 'loan':
      return (
        <LoanForm
          direction={flow.direction ?? 'owed-to-me'}
          accounts={accounts}
          today={today}
          onClose={onClose}
          onRecorded={onRecorded}
        />
      );
    case 'repay':
      return (
        <RepayForm
          key={flow.iou.id}
          iou={flow.iou}
          accounts={accounts}
          categories={categories}
          today={today}
          onClose={onClose}
        />
      );
    case 'writeoff':
      return (
        <WriteOffForm
          key={flow.iou.id}
          iou={flow.iou}
          categories={categoryChoicesFor(categories, 'expense')}
          today={today}
          onClose={onClose}
        />
      );
    case 'due':
      return <DueForm key={flow.iou.id} iou={flow.iou} onClose={onClose} />;
    case 'delete':
      return <DeleteForm key={flow.iou.id} iou={flow.iou} onClose={onClose} />;
  }
}

function useIouChange<A, R>(
  run: (args: A) => Promise<R>,
  onDone: (result: R) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      for (const queryKey of iouQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onDone(result);
    },
  });
}

function FormShell({
  onSubmit,
  error,
  errorText,
  pending,
  submitLabel,
  disabled = false,
  onClose,
  children,
}: {
  onSubmit: () => void;
  error: unknown;
  /** Shown instead of `error`'s own message. */
  errorText?: string | undefined;
  pending: boolean;
  submitLabel: string;
  disabled?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <form
      className="flex flex-col gap-3 p-3"
      noValidate
      onSubmit={(event: SyntheticEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
      {errorText !== undefined ? (
        <p role="alert" className="text-small text-negative">
          {errorText}
        </p>
      ) : error === null || error === undefined ? null : (
        <p role="alert" className="text-small text-negative">
          {describeProblem(error).message}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <BracketButton onPress={onClose}>
          {t('budgetGoalsIous.cancel')}
        </BracketButton>
        <PrimaryButton type="submit" isDisabled={pending || disabled}>
          {pending ? t('budgetGoalsIous.saving') : submitLabel}
        </PrimaryButton>
      </div>
    </form>
  );
}

function dateError(
  error: DateError | undefined,
  notBefore: LocalDate | undefined,
): string | undefined {
  if (error === undefined) return undefined;
  return error === 'invalid'
    ? t('budgetGoalsIous.ious.form.errors.date')
    : t('budgetGoalsIous.ious.form.errors.beforeIou', {
        date: formatLongDay(notBefore ?? localDate('1970-01-01'), locale),
      });
}

function LoanForm({
  direction: initialDirection,
  accounts,
  today,
  onClose,
  onRecorded,
}: {
  direction: IouDirectionView;
  accounts: readonly AccountView[];
  today: LocalDate;
  onClose: () => void;
  onRecorded: ((created: CreatedIous) => void) | undefined;
}) {
  const open = accounts.filter((a) => !a.archived);
  const [direction, setDirection] =
    useState<IouDirectionView>(initialDirection);
  const [accountId, setAccountId] = useState(open[0]?.id ?? '');
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<string>(today);
  const [dueOn, setDueOn] = useState('');
  const [note, setNote] = useState('');
  const [personError, setPersonError] = useState<PersonError>();
  const [dateIssue, setDateIssue] = useState<DateError>();
  const [dueIssue, setDueIssue] = useState(false);
  const [key] = useState(() => randomId());
  const create = useIouChange(
    (body: Parameters<typeof createIou>[0]) => createIou(body, key),
    (created) => {
      onRecorded?.(created);
      onClose();
    },
  );
  const currency = open.find((a) => a.id === accountId)?.currency ?? 'USD';

  const submit = () => {
    const result = toLoanBody(
      direction,
      accountId,
      { person, amount, dueOn },
      currency,
      locale,
      note,
    );
    const on = parseEntryDate(date);
    const dueBad = dueOn.trim() !== '' && !isLocalDate(dueOn.trim());
    setPersonError(result.ok ? undefined : result.errors[0]);
    setDateIssue(on.ok ? undefined : on.error);
    setDueIssue(dueBad);
    if (!result.ok || !on.ok || dueBad) return;
    create.mutate({ ...result.body, occurredOn: on.date });
  };

  return (
    <FormShell
      onSubmit={submit}
      error={create.error}
      pending={create.isPending}
      submitLabel={t('budgetGoalsIous.ious.form.record')}
      disabled={accountId === ''}
      onClose={onClose}
    >
      <ChoiceField
        label={t('budgetGoalsIous.ious.form.direction')}
        value={direction}
        choices={[
          { id: 'owed-to-me', label: t('budgetGoalsIous.ious.form.lend') },
          { id: 'owed-by-me', label: t('budgetGoalsIous.ious.form.borrow') },
        ]}
        placeholder={t('budgetGoalsIous.ious.form.direction')}
        onChange={(id) => {
          setDirection(id === 'owed-by-me' ? 'owed-by-me' : 'owed-to-me');
        }}
      />
      <ChoiceField
        label={
          direction === 'owed-to-me'
            ? t('budgetGoalsIous.ious.form.paidFrom')
            : t('budgetGoalsIous.ious.form.receivedIn')
        }
        value={accountId}
        choices={accountChoicesFor(open, [])}
        placeholder={t('budgetGoalsIous.ious.form.account')}
        onChange={setAccountId}
      />
      <TextField
        label={t('budgetGoalsIous.ious.form.person')}
        value={person}
        error={
          personError === 'person'
            ? t('budgetGoalsIous.ious.form.errors.person')
            : undefined
        }
        onChange={setPerson}
      />
      <TextField
        label={t('budgetGoalsIous.ious.form.amount')}
        value={amount}
        inputMode="decimal"
        error={
          personError === 'amount'
            ? t('budgetGoalsIous.ious.form.errors.amount', {
                example: amountExample(currency, locale),
              })
            : undefined
        }
        onChange={setAmount}
      />
      <TextField
        label={t('budgetGoalsIous.ious.form.date')}
        value={date}
        placeholder={t('budgetGoalsIous.ious.form.dateHint')}
        error={dateError(dateIssue, undefined)}
        onChange={setDate}
      />
      <TextField
        label={t('budgetGoalsIous.ious.form.due')}
        value={dueOn}
        placeholder={t('budgetGoalsIous.ious.form.dateHint')}
        error={
          dueIssue ? t('budgetGoalsIous.ious.form.errors.dueDate') : undefined
        }
        onChange={setDueOn}
      />
      <TextField
        label={t('budgetGoalsIous.ious.form.note')}
        value={note}
        onChange={setNote}
      />
    </FormShell>
  );
}

function RepayForm({
  iou,
  accounts,
  categories,
  today,
  onClose,
}: {
  iou: IouView;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  today: LocalDate;
  onClose: () => void;
}) {
  const currency = iou.outstanding.currency;
  const options = accounts.filter(
    (a) => !a.archived && a.currency === currency,
  );
  const toMe = iou.direction === 'owed-to-me';
  // With several open IOUs for the person, the payment goes to the person:
  // the server settles the oldest first and moves the surplus on. The most it
  // may take is the person's open total, which the server sends.
  const byPerson = iou.personOpen.count > 1;
  const owed = byPerson ? iou.personOpen.outstanding : iou.outstanding;
  const [accountId, setAccountId] = useState(options[0]?.id ?? '');
  const [amount, setAmount] = useState(formatMoneyInput(owed, locale));
  const [date, setDate] = useState<string>(today);
  const [amountBad, setAmountBad] = useState(false);
  const [dateIssue, setDateIssue] = useState<DateError>();
  const surplusChoices = categoryChoicesFor(
    categories,
    toMe ? 'income' : 'expense',
  );
  const [surplusId, setSurplusId] = useState(surplusChoices[0]?.id ?? '');
  const repay = useIouChange(repayIous, onClose);
  // More than is owed (a round-up or a tip): the server settles what is owed
  // and records the rest, so the browser only compares.
  const parsedNow = positive(amount, currency, locale);
  const over = parsedNow !== null && parsedNow.amountMinor > owed.amountMinor;

  const submit = () => {
    const parsed = positive(amount, currency, locale);
    const on = parseEntryDate(date, iou.recordedOn);
    setAmountBad(parsed === null);
    setDateIssue(on.ok ? undefined : on.error);
    if (parsed === null || !on.ok) return;
    const settled = over ? owed : parsed;
    const surplus = over ? { paid: parsed, surplusCategoryId: surplusId } : {};
    repay.mutate(
      byPerson
        ? {
            accountId,
            person: iou.person,
            amount: settled,
            direction: iou.direction,
            occurredOn: on.date,
            ...surplus,
          }
        : {
            accountId,
            settles: [{ iouId: iou.id, amount: settled }],
            direction: iou.direction,
            occurredOn: on.date,
            ...surplus,
          },
    );
  };

  return (
    <FormShell
      onSubmit={submit}
      error={repay.error}
      pending={repay.isPending}
      submitLabel={
        toMe
          ? t('budgetGoalsIous.ious.form.recordRepayment')
          : t('budgetGoalsIous.ious.form.recordPayBack')
      }
      disabled={accountId === '' || (over && surplusId === '')}
      onClose={onClose}
    >
      <ChoiceField
        label={
          toMe
            ? t('budgetGoalsIous.ious.form.arrivedIn')
            : t('budgetGoalsIous.ious.form.paidFrom')
        }
        value={accountId}
        choices={accountChoicesFor(options, [])}
        placeholder={t('budgetGoalsIous.ious.form.account')}
        onChange={setAccountId}
      />
      <TextField
        label={t('budgetGoalsIous.ious.form.amount')}
        value={amount}
        inputMode="decimal"
        autoFocus
        error={
          amountBad
            ? t('budgetGoalsIous.ious.form.errors.amount', {
                example: amountExample(currency, locale),
              })
            : undefined
        }
        onChange={setAmount}
      />
      <p className="num text-small text-text-muted">
        {byPerson
          ? t('budgetGoalsIous.ious.form.stillOwedAcross', {
              count: iou.personOpen.count,
              amount: formatMoney(owed, 'symbol', locale),
            })
          : t('budgetGoalsIous.ious.form.stillOwed', {
              amount: formatMoney(owed, 'symbol', locale),
            })}
      </p>
      {over ? (
        <>
          <p className="font-sans text-small text-text-muted">
            {toMe
              ? t('budgetGoalsIous.ious.form.surplusIncome')
              : t('budgetGoalsIous.ious.form.surplusSpending')}
          </p>
          <ChoiceField
            label={t('budgetGoalsIous.ious.form.category')}
            value={surplusId}
            choices={surplusChoices}
            placeholder={t('budgetGoalsIous.ious.form.category')}
            onChange={setSurplusId}
          />
        </>
      ) : null}
      <TextField
        label={t('budgetGoalsIous.ious.form.date')}
        value={date}
        placeholder={t('budgetGoalsIous.ious.form.dateHint')}
        error={dateError(dateIssue, iou.recordedOn)}
        onChange={setDate}
      />
    </FormShell>
  );
}

function WriteOffForm({
  iou,
  categories,
  today,
  onClose,
}: {
  iou: IouView;
  categories: readonly { id: string; label: string }[];
  today: LocalDate;
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [date, setDate] = useState<string>(today);
  const [dateIssue, setDateIssue] = useState<DateError>();
  const off = useIouChange(
    (on: LocalDate) => writeOffIou(iou.id, { categoryId, occurredOn: on }),
    onClose,
  );
  const submit = () => {
    const on = parseEntryDate(date, iou.recordedOn);
    setDateIssue(on.ok ? undefined : on.error);
    if (on.ok) off.mutate(on.date);
  };
  return (
    <FormShell
      onSubmit={submit}
      error={off.error}
      pending={off.isPending}
      submitLabel={t('budgetGoalsIous.ious.form.confirmWriteOff')}
      disabled={categoryId === ''}
      onClose={onClose}
    >
      <p className="font-sans text-small">
        {t('budgetGoalsIous.ious.form.writeOffBody', {
          amount: formatMoney(iou.outstanding, 'symbol', locale),
          person: iou.person,
        })}
      </p>
      <p className="font-sans text-small text-text-muted">
        {iou.writeOffOffered || iou.writeOffOfferedOn === null
          ? t('budgetGoalsIous.ious.form.writeOffOffered')
          : t('budgetGoalsIous.ious.form.writeOffAnyTime', {
              date: formatLongDay(iou.writeOffOfferedOn, locale),
            })}
      </p>
      <ChoiceField
        label={t('budgetGoalsIous.ious.form.category')}
        value={categoryId}
        choices={categories}
        placeholder={t('budgetGoalsIous.ious.form.category')}
        onChange={setCategoryId}
      />
      <TextField
        label={t('budgetGoalsIous.ious.form.date')}
        value={date}
        placeholder={t('budgetGoalsIous.ious.form.dateHint')}
        error={dateError(dateIssue, iou.recordedOn)}
        onChange={setDate}
      />
    </FormShell>
  );
}

function DueForm({ iou, onClose }: { iou: IouView; onClose: () => void }) {
  const [dueOn, setDueOn] = useState(iou.dueOn ?? '');
  const [bad, setBad] = useState(false);
  const save = useIouChange(
    (body: Parameters<typeof updateIou>[1]) => updateIou(iou.id, body),
    onClose,
  );
  const submit = () => {
    const text = dueOn.trim();
    const invalid = text !== '' && !isLocalDate(text);
    setBad(invalid);
    if (!invalid) save.mutate({ dueOn: text === '' ? null : localDate(text) });
  };
  return (
    <FormShell
      onSubmit={submit}
      error={save.error}
      pending={save.isPending}
      submitLabel={t('budgetGoalsIous.ious.form.saveDue')}
      onClose={onClose}
    >
      <TextField
        label={t('budgetGoalsIous.ious.form.due')}
        value={dueOn}
        autoFocus
        placeholder={t('budgetGoalsIous.ious.form.dateHint')}
        error={bad ? t('budgetGoalsIous.ious.form.errors.dueDate') : undefined}
        onChange={setDueOn}
      />
    </FormShell>
  );
}

/**
 * Deletes the entry that recorded the IOU, with everyone else it recorded
 * (a split bill's other people, and the user's own share). The server
 * refuses while a payment still stands.
 */
function DeleteForm({ iou, onClose }: { iou: IouView; onClose: () => void }) {
  const all = useQuery(allIousQuery).data?.ious;
  const shared = (all ?? []).filter(
    (other) => other.originId === iou.originId && other.id !== iou.id,
  );
  const remove = useIouChange(() => reverseTransaction(iou.originId), onClose);
  const hasPayments =
    remove.error instanceof ApiError &&
    remove.error.problem.code === 'iou_has_payments';
  return (
    <FormShell
      onSubmit={() => {
        remove.mutate(undefined);
      }}
      error={hasPayments ? null : remove.error}
      errorText={
        hasPayments ? t('budgetGoalsIous.ious.form.hasPayments') : undefined
      }
      pending={remove.isPending}
      submitLabel={t('budgetGoalsIous.ious.form.confirmDelete')}
      onClose={onClose}
    >
      <p className="font-sans text-small">
        {t('budgetGoalsIous.ious.form.deleteBody')}
      </p>
      {shared.length > 0 ? (
        <p className="font-sans text-small text-text-muted">
          {t('budgetGoalsIous.ious.form.deleteShared', {
            names: shared.map((other) => other.person).join(', '),
          })}
        </p>
      ) : null}
    </FormShell>
  );
}
