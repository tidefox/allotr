import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';
import { money, type Money, type TransactionView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import {
  emptyPerson,
  toConvertBody,
  type PersonDraft,
  type PersonError,
} from '@/features/ious/draft';
import { entryQueryKeys } from '@/lib/ledger';
import { convertToIou, iouQueryKeys } from '@/lib/ious';
import { describeProblem } from '@/lib/problem';
import { randomId } from '@/lib/random-id';
import { t } from '@/messages/t';
import { PeopleEditor } from './people-editor.tsx';

const locale = 'en';

/** The whole bill: what the logged expense took out of its account. */
export function billOf(entry: TransactionView): Money | null {
  const out = entry.postings.find(
    (p) => p.systemRole === null && p.amount.amountMinor < 0,
  );
  return out === undefined
    ? null
    : money(-out.amount.amountMinor, out.amount.currency);
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
        <PeopleEditor
          people={people}
          bill={bill}
          currency={bill?.currency ?? ''}
          locale={locale}
          errors={errors}
          onChange={change}
        />
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
