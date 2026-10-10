import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';
import { money, type Money, type TransactionView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import {
  emptyPerson,
  fillEven,
  toConvertBody,
  type PersonDraft,
  type PersonError,
} from '@/features/ious/draft';
import { amountExample } from '@/features/quick-entry/draft';
import { entryQueryKeys } from '@/lib/ledger';
import { convertToIou, iouQueryKeys, peopleQuery } from '@/lib/ious';
import { describeProblem } from '@/lib/problem';
import { randomId } from '@/lib/random-id';
import { t } from '@/messages/t';
import { TextField } from './fields.tsx';

const locale = 'en';

/** The most people the server takes in one entry. */
export const MAX_PEOPLE = 20;

/** The whole bill: what the logged expense took out of its account. */
export function billOf(entry: TransactionView): Money | null {
  const out = entry.postings.find(
    (p) => p.systemRole === null && p.amount.amountMinor < 0,
  );
  return out === undefined
    ? null
    : money(-out.amount.amountMinor, out.amount.currency);
}

/** Names used before that start like what was typed, as one-tap choices. */
function Suggestions({
  value,
  onPick,
}: {
  value: string;
  onPick: (name: string) => void;
}) {
  const names = useQuery(peopleQuery(value.trim()));
  const shown = (names.data?.people ?? []).filter((name) => name !== value);
  if (shown.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t('transactionDetail.iou.suggestions')}
      className="flex flex-wrap gap-1"
    >
      {shown.slice(0, 5).map((name) => (
        <BracketButton
          key={name}
          onPress={() => {
            onPick(name);
          }}
        >
          {name}
        </BracketButton>
      ))}
    </div>
  );
}

/**
 * Splits a logged expense with people. The entry is the whole bill; each
 * person owes an even share until their amount is typed, and the server
 * keeps the rest as the user's own share, or refuses when people owe more
 * than the bill. The entry is replaced by the split (an undo plus a new
 * entry); a repeated key returns what the first try made.
 */
export function IouSheet({
  entry,
  onClose,
  onSaved,
}: {
  entry: TransactionView;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const bill = billOf(entry);
  const [people, setPeople] = useState<readonly PersonDraft[]>([emptyPerson]);
  const [errors, setErrors] = useState<Record<number, PersonError>>({});
  const key = useRef(randomId());
  const save = useMutation({
    mutationFn: (body: Parameters<typeof convertToIou>[1]) =>
      convertToIou(entry.id, body, key.current),
    onSuccess: (converted) => {
      for (const queryKey of [...entryQueryKeys, ...iouQueryKeys])
        void queryClient.invalidateQueries({ queryKey });
      onSaved(converted.transaction.id);
    },
  });

  // Amounts nobody typed are shown, and saved, as even shares.
  const shown = fillEven(people, bill, locale);
  const change = (next: readonly PersonDraft[]) => {
    if (save.isError) save.reset();
    setPeople(next);
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (bill === null || save.isPending) return;
    const built = toConvertBody(bill, people, locale);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    save.mutate(built.body);
  };

  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
      title={t('transactionDetail.iou.title')}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <p className="font-sans text-small text-text-muted">
          {t('transactionDetail.iou.intro')}
        </p>
        {shown.map((p, index) => (
          // Rows have no identity of their own; they are edited in place.
          <fieldset
            key={index}
            className="flex flex-col gap-2 border border-outline p-2"
          >
            <legend className="px-1 text-small text-text-muted">
              {t('transactionDetail.iou.person', { n: index + 1 })}
            </legend>
            <TextField
              label={t('transactionDetail.iou.name', { n: index + 1 })}
              value={p.person}
              error={
                errors[index] === 'person'
                  ? t('transactionDetail.iou.errors.person')
                  : undefined
              }
              onChange={(person) => {
                change(
                  people.map((q, i) => (i === index ? { ...q, person } : q)),
                );
              }}
            />
            <Suggestions
              value={p.person}
              onPick={(person) => {
                change(
                  people.map((q, i) => (i === index ? { ...q, person } : q)),
                );
              }}
            />
            <TextField
              label={t('transactionDetail.iou.owes', {
                n: index + 1,
                currency: bill?.currency ?? '',
              })}
              value={p.amount}
              inputMode="decimal"
              error={
                errors[index] === 'amount'
                  ? t('transactionDetail.iou.errors.amount', {
                      example: amountExample(bill?.currency ?? '', locale),
                    })
                  : undefined
              }
              onChange={(amount) => {
                change(
                  people.map((q, i) =>
                    i === index ? { ...q, amount, edited: true } : q,
                  ),
                );
              }}
            />
            {people.length > 1 ? (
              <div>
                <BracketButton
                  tone="destructive"
                  onPress={() => {
                    change(people.filter((_, i) => i !== index));
                  }}
                >
                  {t('transactionDetail.iou.remove', { n: index + 1 })}
                </BracketButton>
              </div>
            ) : null}
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center gap-1">
          {people.length < MAX_PEOPLE ? (
            <BracketButton
              onPress={() => {
                change([...people, emptyPerson]);
              }}
            >
              {t('transactionDetail.iou.add')}
            </BracketButton>
          ) : null}
          {people.some((p) => p.edited === true) ? (
            <BracketButton
              onPress={() => {
                change(people.map((p) => ({ ...p, edited: false })));
              }}
            >
              {t('transactionDetail.iou.evenly')}
            </BracketButton>
          ) : null}
        </div>
        {save.isError ? (
          <p role="alert" className="text-small text-negative">
            {describeProblem(save.error).message}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('transactionDetail.edit.cancel')}
          </BracketButton>
          <PrimaryButton
            type="submit"
            isDisabled={bill === null || save.isPending}
          >
            {save.isPending
              ? t('transactionDetail.iou.saving')
              : t('transactionDetail.iou.save')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}
