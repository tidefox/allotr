import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SyntheticEvent } from 'react';
import {
  formatMoneyInput,
  MoneyError,
  parseMoney,
  type TransactionView,
  type WithdrawalLinkCandidateView,
} from '@allotr/shared';
import { Amount } from '@/components/amount';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { Sheet } from '@/components/sheet';
import { ledgerRows } from '@/features/ledger/rows';
import { formatTerminalDate } from '@/features/today/format';
import {
  allAccountsQuery,
  allCategoriesQuery,
  entryQueryKeys,
} from '@/lib/ledger';
import { formatMoney } from '@/lib/format-money';
import { describeProblem } from '@/lib/problem';
import { createWithdrawalLink } from '@/lib/withdrawal-links';
import { t } from '@/messages/t';
import { TextField } from './fields.tsx';
import {
  candidateTitle,
  linkBody,
  type LinkRole,
} from './withdrawal-link-model.ts';

const locale = 'en';

const columns: readonly RowColumn[] = [
  { width: '7ch' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
  { width: 'auto' },
];

/**
 * Picks the entry to link with and the part of it the link covers. The
 * server lists the entries that fit and the most each can take (`room`),
 * which prefills the amount; the amount typed is an input aid, and the
 * server refuses what does not fit.
 */
export function WithdrawalLinkSheet({
  entry,
  role,
  candidates,
  onClose,
}: {
  entry: TransactionView;
  role: LinkRole;
  candidates: readonly WithdrawalLinkCandidateView[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);
  const [chosenId, setChosenId] = useState<string | undefined>();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | undefined>();

  const rows = useMemo(
    () =>
      accounts.data === undefined || categories.data === undefined
        ? []
        : ledgerRows(
            candidates.map((c) => c.transaction),
            accounts.data.accounts,
            categories.data.categories,
          ),
    [accounts.data, categories.data, candidates],
  );
  const chosen = candidates.find((c) => c.transaction.id === chosenId);

  const save = useMutation({
    mutationFn: (body: Parameters<typeof createWithdrawalLink>[0]) =>
      createWithdrawalLink(body),
    onSuccess: () => {
      for (const queryKey of entryQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });

  const choose = (candidate: WithdrawalLinkCandidateView) => {
    if (save.isError) save.reset();
    setChosenId(candidate.transaction.id);
    setAmount(formatMoneyInput(candidate.room, locale));
    setError(undefined);
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (chosen === undefined) {
      setError(t('withdrawalLinks.chooseOne'));
      return;
    }
    let value: ReturnType<typeof parseMoney>;
    try {
      value = parseMoney(amount, chosen.room.currency, locale);
    } catch (caught) {
      if (!(caught instanceof MoneyError)) throw caught;
      setError(t('quickEntry.errors.amountInvalid', { example: '12.50' }));
      return;
    }
    if (value.amountMinor <= 0) {
      setError(t('quickEntry.errors.amountPositive'));
      return;
    }
    setError(undefined);
    save.mutate(linkBody(role, entry.id, chosen.transaction.id, value));
  };

  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
      title={t(`withdrawalLinks.${role}.sheetTitle`)}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 py-3">
        <p className="px-3 font-sans text-small text-text-muted">
          {t(`withdrawalLinks.${role}.intro`)}
        </p>
        <section
          aria-label={t(`withdrawalLinks.${role}.candidates`)}
          className="flex flex-col border-t [&>:last-child]:border-b"
        >
          {rows.map((row, index) => {
            const candidate = candidates[index];
            if (candidate === undefined) return null;
            return (
              <Row
                key={row.id}
                columns={columns}
                selected={row.id === chosenId}
                onPress={() => {
                  choose(candidate);
                }}
                cells={[
                  <span key="day" className="text-text-muted">
                    {formatTerminalDate(row.occurredOn, locale)}
                  </span>,
                  <span key="title" className="font-sans">
                    {candidateTitle(row, t('withdrawalLinks.noName'))}
                  </span>,
                  row.amount === null ? null : (
                    <Amount
                      key="amount"
                      amount={row.amount}
                      kind={row.moves ? 'transfer' : 'expense'}
                      locale={locale}
                    />
                  ),
                  <span key="room" className="text-text-muted">
                    {t('withdrawalLinks.room', {
                      amount: formatMoney(candidate.room, 'symbol', locale),
                    })}
                  </span>,
                ]}
              />
            );
          })}
        </section>
        <div className="px-3">
          <TextField
            label={t(`withdrawalLinks.${role}.amount`)}
            value={amount}
            onChange={setAmount}
            error={error}
            inputMode="decimal"
          />
        </div>
        {save.isError ? (
          <p role="alert" className="px-3 text-small text-negative">
            {describeProblem(save.error).message}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2 px-3">
          <BracketButton onPress={onClose}>
            {t('withdrawalLinks.cancel')}
          </BracketButton>
          <PrimaryButton type="submit" isDisabled={save.isPending}>
            {save.isPending
              ? t('withdrawalLinks.saving')
              : t('withdrawalLinks.save')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}
