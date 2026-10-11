import { useMemo, type Dispatch, type SetStateAction } from 'react';
import type { AccountView, CategoryView } from '@allotr/shared';
import { BracketButton } from '@/components/buttons';
import {
  addLine,
  amountExample,
  draftErrorText,
  endSplit,
  isSplit,
  lineField,
  removeLine,
  splitCurrency,
  splitRemainder,
  startSplit,
  updateLine,
  type DraftErrors,
  type DraftField,
  type QuickEntryDraft,
} from '@/features/quick-entry/draft';
import { formatMoney } from '@/lib/format-money';
import { t } from '@/messages/t';
import { accountChoicesFor, categoryChoicesFor } from './choices.ts';
import { ChoiceField, FormRow, TextField } from './fields.tsx';

/**
 * The fields of an entry form: amount, accounts, category or split lines,
 * note, date and time. The edit sheet and the + new forms share it; the
 * caller owns the draft, the errors and the buttons.
 */
export function EntryFields({
  draft,
  setDraft,
  errors,
  accounts,
  categories,
  locale,
  autoFocus = true,
  withPeople = false,
}: {
  draft: QuickEntryDraft;
  setDraft: Dispatch<SetStateAction<QuickEntryDraft>>;
  errors: DraftErrors;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  locale: string;
  autoFocus?: boolean;
  /**
   * The form also takes people the bill is split with: one category for the
   * whole expense, and no time (the split is dated by day).
   */
  withPeople?: boolean;
}) {
  const context = useMemo(() => ({ accounts, locale }), [accounts, locale]);
  const patch = (next: Partial<QuickEntryDraft>) => {
    setDraft((d) => ({ ...d, ...next }));
  };
  const account = accounts.find((a) => a.id === draft.accountId);
  const toAccount = accounts.find((a) => a.id === draft.toAccountId);
  const example = (currency: string | undefined) =>
    amountExample(currency ?? 'USD', locale);
  const errorText = (field: DraftField, currency?: string) => {
    const key = errors[field];
    return key === undefined
      ? undefined
      : draftErrorText(key, example(currency));
  };
  const crossCurrency =
    draft.kind === 'transfer' &&
    account !== undefined &&
    toAccount !== undefined &&
    account.currency !== toAccount.currency;
  const accountChoices = accountChoicesFor(accounts, [
    draft.accountId,
    draft.toAccountId,
  ]);
  const categoryChoices = categoryChoicesFor(categories, draft.kind);
  const remainder = isSplit(draft) ? splitRemainder(draft, context) : null;
  const lineCurrency = splitCurrency(draft, accounts);

  return (
    <>
      <TextField
        label={t('quickEntry.amountIn', { currency: account?.currency ?? '' })}
        value={draft.amount}
        onChange={(amount) => {
          patch({ amount });
        }}
        error={errorText('amount', account?.currency)}
        inputMode="decimal"
        autoFocus={autoFocus}
      />
      <FormRow>
        <ChoiceField
          label={
            draft.kind === 'transfer'
              ? t('quickEntry.fromAccount')
              : t('quickEntry.account')
          }
          value={draft.accountId}
          choices={accountChoices}
          placeholder={t('transactionDetail.edit.chooseAccount')}
          onChange={(accountId) => {
            patch({ accountId });
          }}
          error={errorText('accountId')}
        />
        {draft.kind === 'transfer' ? (
          <ChoiceField
            label={t('quickEntry.toAccount')}
            value={draft.toAccountId}
            choices={accountChoices}
            placeholder={t('transactionDetail.edit.chooseAccount')}
            onChange={(toAccountId) => {
              patch({ toAccountId });
            }}
            error={errorText('toAccountId')}
          />
        ) : null}
      </FormRow>
      {crossCurrency ? (
        <TextField
          label={t('quickEntry.receivedIn', { currency: toAccount.currency })}
          value={draft.received}
          onChange={(received) => {
            patch({ received });
          }}
          error={errorText('received', toAccount.currency)}
          inputMode="decimal"
        />
      ) : null}
      {draft.foreignCurrency === '' ? null : (
        <TextField
          label={t('quickEntry.priceIn', { currency: draft.foreignCurrency })}
          value={draft.foreign}
          onChange={(foreign) => {
            patch({ foreign });
          }}
          error={errorText('foreign', draft.foreignCurrency)}
          inputMode="decimal"
        />
      )}

      {isSplit(draft) ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-small text-text-muted">
            {t('quickEntry.split.legend')}
          </legend>
          {draft.lines.map((line, index) => (
            <FormRow key={index}>
              <ChoiceField
                label={t('quickEntry.split.category', { n: index + 1 })}
                value={line.categoryId}
                choices={categoryChoices}
                placeholder={t('quickEntry.chooseCategory')}
                onChange={(categoryId) => {
                  setDraft((d) => updateLine(d, index, { categoryId }));
                }}
                error={errorText(lineField(index, 'categoryId'))}
              />
              <TextField
                label={t('quickEntry.split.amount', { n: index + 1 })}
                value={line.amount}
                onChange={(amount) => {
                  setDraft((d) => updateLine(d, index, { amount }));
                }}
                error={errorText(lineField(index, 'amount'), lineCurrency)}
                inputMode="decimal"
              />
              {draft.lines.length > 2 ? (
                <BracketButton
                  tone="destructive"
                  aria-label={t('quickEntry.split.remove', { n: index + 1 })}
                  onPress={() => {
                    setDraft((d) => removeLine(d, index));
                  }}
                >
                  −
                </BracketButton>
              ) : null}
            </FormRow>
          ))}
          <p
            role="status"
            className={
              errors.lines === undefined
                ? 'text-small text-text-muted'
                : 'text-small text-negative'
            }
          >
            {errors.lines === undefined
              ? remainderText(remainder, locale)
              : draftErrorText(errors.lines, example(lineCurrency))}
          </p>
          <div className="flex gap-2">
            <BracketButton
              onPress={() => {
                setDraft(addLine);
              }}
            >
              {t('quickEntry.split.add')}
            </BracketButton>
            <BracketButton
              onPress={() => {
                setDraft(endSplit);
              }}
            >
              {t('quickEntry.split.end')}
            </BracketButton>
          </div>
        </fieldset>
      ) : (
        <>
          <ChoiceField
            label={
              draft.kind === 'transfer'
                ? t('quickEntry.categoryOptional')
                : t('quickEntry.category')
            }
            value={draft.categoryId}
            choices={categoryChoices}
            placeholder={
              draft.kind === 'transfer'
                ? t('quickEntry.noCategory')
                : t('quickEntry.chooseCategory')
            }
            onChange={(categoryId) => {
              patch({ categoryId });
            }}
            error={errorText('categoryId')}
          />
          {draft.kind === 'transfer' || withPeople ? null : (
            <div>
              <BracketButton
                onPress={() => {
                  setDraft(startSplit);
                }}
              >
                {t('quickEntry.split.start')}
              </BracketButton>
            </div>
          )}
        </>
      )}

      <TextField
        label={t('transactionDetail.edit.payee')}
        value={draft.note}
        onChange={(note) => {
          patch({ note });
        }}
      />
      <FormRow>
        <TextField
          label={t('quickEntry.date')}
          value={draft.occurredOn}
          onChange={(occurredOn) => {
            patch({ occurredOn });
          }}
          placeholder={t('transactionDetail.edit.format')}
          error={errorText('occurredOn')}
        />
        {withPeople ? null : (
          <TextField
            label={t('quickEntry.time')}
            value={draft.occurredTime}
            onChange={(occurredTime) => {
              patch({ occurredTime });
            }}
            placeholder={t('transactionDetail.edit.timeFormat')}
            error={errorText('occurredTime')}
          />
        )}
      </FormRow>
    </>
  );
}

function remainderText(
  remainder: ReturnType<typeof splitRemainder>,
  locale: string,
): string {
  if (remainder === null) return t('quickEntry.split.enterAmount');
  if (remainder.amountMinor === 0) return t('quickEntry.split.assigned');
  const amount = formatMoney(
    {
      ...remainder,
      amountMinor: Math.abs(remainder.amountMinor),
    },
    'symbol',
    locale,
  );
  return remainder.amountMinor > 0
    ? t('quickEntry.split.left', { amount })
    : t('quickEntry.split.over', { amount });
}
