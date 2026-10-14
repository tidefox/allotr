import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { TransactionView, WithdrawalLinkView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { BracketButton, Tag } from '@/components/buttons';
import { SectionTitle } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { ledgerRows } from '@/features/ledger/rows';
import { formatTerminalDate } from '@/features/today/format';
import { IconAddLine } from '@/generated/icons';
import {
  allAccountsQuery,
  allCategoriesQuery,
  entryQuery,
  entryQueryKeys,
} from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import {
  deleteWithdrawalLink,
  linkCandidatesQuery,
} from '@/lib/withdrawal-links';
import { t } from '@/messages/t';
import { WithdrawalLinkSheet } from './withdrawal-link-sheet.tsx';
import {
  candidateTitle,
  canTakeLinks,
  otherEntryId,
  sectionRole,
  showsLinks,
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
 * "Paid from savings" on an expense and "Paid for" on a savings withdrawal
 * (ADR 0038): the links the entry has, each removable, and a way to add
 * one from the entries the server says can take it.
 */
export function WithdrawalLinksSection({
  entry,
  onOpen,
}: {
  entry: TransactionView;
  onOpen: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const live = canTakeLinks(entry);
  const candidates = useQuery(linkCandidatesQuery(entry.id, live));
  const links = entry.withdrawalLinks;
  const candidateRole = live ? candidates.data?.role : undefined;
  if (candidates.isError && links.length === 0 && live)
    return (
      <section
        aria-label={t('withdrawalLinks.expense.title')}
        className="-mx-3 flex flex-col"
      >
        <p role="alert" className="px-3 pt-2 text-small text-text-muted">
          {t('withdrawalLinks.loadFailed')}
        </p>
      </section>
    );
  if (!showsLinks(entry, candidateRole)) return null;

  const role = sectionRole(entry, candidateRole);
  const options = live ? (candidates.data?.candidates ?? []) : [];
  const title = t(`withdrawalLinks.${role}.title`);
  return (
    <section aria-label={title} className="-mx-3 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3">
        <SectionTitle>{title}</SectionTitle>
        {options.length === 0 ? null : (
          <BracketButton
            icon={IconAddLine}
            className="mt-2"
            onPress={() => {
              setAdding(true);
            }}
          >
            {t(`withdrawalLinks.${role}.action`)}
          </BracketButton>
        )}
      </div>
      {links.map((link) => (
        <LinkLine
          key={link.id}
          link={link}
          entryId={entry.id}
          role={role}
          onOpen={onOpen}
        />
      ))}
      {options.length === 0 && links.length === 0 ? (
        <p className="px-3 py-1 text-small text-text-muted">
          {t(`withdrawalLinks.${role}.empty`)}
        </p>
      ) : null}
      {adding && options.length > 0 ? (
        <WithdrawalLinkSheet
          entry={entry}
          role={role}
          candidates={options}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </section>
  );
}

/** One link: the entry at the other end, the amount, and remove. */
function LinkLine({
  link,
  entryId,
  role,
  onOpen,
}: {
  link: WithdrawalLinkView;
  entryId: string;
  role: LinkRole;
  onOpen: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const otherId = otherEntryId(link, entryId);
  const other = useQuery(entryQuery(otherId));
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteWithdrawalLink(link.id),
    onSuccess: () => {
      for (const queryKey of entryQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
    },
  });

  const [row] =
    other.data === undefined ||
    accounts.data === undefined ||
    categories.data === undefined
      ? []
      : ledgerRows(
          [other.data],
          accounts.data.accounts,
          categories.data.categories,
        );
  const name =
    row === undefined
      ? t('withdrawalLinks.loading')
      : candidateTitle(row, t('withdrawalLinks.noName'));
  const muted = !link.valid;
  return (
    <>
      <Row
        columns={columns}
        cells={[
          <span key="day" className="text-text-muted">
            {row === undefined
              ? ''
              : formatTerminalDate(row.occurredOn, locale)}
          </span>,
          <span
            key="name"
            className={muted ? 'font-sans text-text-muted' : 'font-sans'}
          >
            {name}
          </span>,
          <span key="amount" className="flex items-center gap-1.5">
            {muted ? (
              <Tag className="shrink-0">{t('withdrawalLinks.notCounting')}</Tag>
            ) : null}
            <span className={muted ? 'text-text-muted' : undefined}>
              <Amount
                amount={link.amount}
                kind={role === 'expense' ? 'expense' : 'transfer'}
                locale={locale}
              />
            </span>
          </span>,
          <span key="actions" className="flex items-center gap-1">
            <BracketButton
              aria-label={`${t('withdrawalLinks.open')} ${name}`}
              onPress={() => {
                onOpen(otherId);
              }}
            >
              {t('withdrawalLinks.open')}
            </BracketButton>
            <BracketButton
              tone="destructive"
              aria-label={t('withdrawalLinks.removeLabel', { name })}
              isDisabled={remove.isPending}
              onPress={() => {
                setConfirming(true);
              }}
            >
              {t('withdrawalLinks.remove')}
            </BracketButton>
          </span>,
        ]}
      />
      {link.reason === null ? null : (
        <p className="border-b px-3 pb-1 text-small text-text-muted">
          {t(`withdrawalLinks.reasons.${link.reason}`)}
        </p>
      )}
      {confirming ? (
        <div
          role="group"
          aria-label={t('withdrawalLinks.confirm')}
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-3 py-1.5"
        >
          <p className="w-full text-small text-text-muted">
            {t('withdrawalLinks.confirm')}
          </p>
          <BracketButton
            tone="destructive"
            isDisabled={remove.isPending}
            onPress={() => {
              remove.mutate();
            }}
          >
            {remove.isPending
              ? t('withdrawalLinks.removing')
              : t('withdrawalLinks.confirmYes')}
          </BracketButton>
          <BracketButton
            onPress={() => {
              setConfirming(false);
            }}
          >
            {t('withdrawalLinks.confirmKeep')}
          </BracketButton>
        </div>
      ) : null}
      {remove.isError ? (
        <p role="alert" className="px-3 py-1 text-small text-negative">
          {describeProblem(remove.error).message}
        </p>
      ) : null}
    </>
  );
}
