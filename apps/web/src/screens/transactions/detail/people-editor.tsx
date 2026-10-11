import { useQuery } from '@tanstack/react-query';
import type { Money } from '@allotr/shared';
import { BracketButton } from '@/components/buttons';
import {
  emptyPerson,
  fillEven,
  type PersonDraft,
  type PersonError,
} from '@/features/ious/draft';
import { amountExample } from '@/features/quick-entry/draft';
import { peopleQuery } from '@/lib/ious';
import { t } from '@/messages/t';
import { TextField } from './fields.tsx';

/** The most people the server takes in one entry. */
export const MAX_PEOPLE = 20;

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
 * The people a bill is split with: a name and an amount each. Amounts nobody
 * typed are shown, and saved by the caller, as even shares of the bill.
 */
export function PeopleEditor({
  people,
  bill,
  currency,
  locale,
  errors,
  onChange,
}: {
  people: readonly PersonDraft[];
  /** The whole bill, or null while it does not read as money. */
  bill: Money | null;
  currency: string;
  locale: string;
  errors: Readonly<Record<number, PersonError>>;
  onChange: (people: readonly PersonDraft[]) => void;
}) {
  const shown = fillEven(people, bill, locale);
  const change = onChange;
  return (
    <>
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
              currency: currency,
            })}
            value={p.amount}
            inputMode="decimal"
            error={
              errors[index] === 'amount'
                ? t('transactionDetail.iou.errors.amount', {
                    example: amountExample(currency, locale),
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
    </>
  );
}
