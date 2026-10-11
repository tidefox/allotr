import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  money,
  type IouSettlementView,
  type IouView,
  type Money,
} from '@allotr/shared';
import { Amount } from '@/components/amount';
import { BracketButton, Tag } from '@/components/buttons';
import { SectionTitle } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { IconCalendar2Line, IconCheckLine } from '@/generated/icons';
import { formatDay, formatTerminalDate } from '@/features/today/format';
import { iouQueryKeys } from '@/lib/ious';
import { formatMoney } from '@/lib/format-money';
import { reverseTransaction } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import type { IouFlow } from './iou-sheets.tsx';
import { personFigure, type Person } from './ious-model.ts';

const locale = 'en';

function kindLabel(settlement: IouSettlementView, iou: IouView): string {
  return settlement.kind === 'write-off'
    ? t('budgetGoalsIous.ious.writtenOff')
    : iou.direction === 'owed-to-me'
      ? t('budgetGoalsIous.ious.repaid')
      : t('budgetGoalsIous.ious.paidBack');
}

const historyColumns: readonly RowColumn[] = [
  { width: '7ch' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
  { width: 'auto' },
];

/**
 * A person's IOUs (the locked design's person pane): what they owe or you
 * owe, then each IOU's history (the loan and its payments) and the ways to
 * settle it.
 */
export function PersonDetail({
  person,
  onFlow,
}: {
  person: Person;
  onFlow: (flow: IouFlow) => void;
}) {
  const figure = personFigure(person);
  const headline = person.settled
    ? t('budgetGoalsIous.ious.allSettled')
    : figure === null
      ? t('budgetGoalsIous.ious.openMany', { count: person.open.length })
      : figure.toMe
        ? t('budgetGoalsIous.ious.owesYouTag')
        : t('budgetGoalsIous.ious.youOweTag');
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-text-muted">{headline}</span>
        {figure === null ? null : (
          <span
            className={cn(
              'text-big leading-[1.15] font-semibold tracking-[-0.01em]',
              !person.settled &&
                (figure.toMe ? 'text-positive' : 'text-negative'),
            )}
          >
            <Amount amount={figure.amount} locale={locale} />
          </span>
        )}
      </div>
      <SectionTitle>{t('budgetGoalsIous.ious.history')}</SectionTitle>
      {person.ious.map((iou) => (
        <IouBlock key={iou.id} iou={iou} onFlow={onFlow} />
      ))}
    </div>
  );
}

/** Money in for you shows `+` and `positive`, money out `−` and `negative`. */
function signed(amount: Money, inward: boolean): Money {
  return inward ? amount : money(-amount.amountMinor, amount.currency);
}

function IouBlock({
  iou,
  onFlow,
}: {
  iou: IouView;
  onFlow: (flow: IouFlow) => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: reverseTransaction,
    onSuccess: () => {
      for (const queryKey of iouQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
    },
  });
  const toMe = iou.direction === 'owed-to-me';
  const payments = iou.settlements.filter((s) => !s.undone);
  const date = formatDay(iou.recordedOn, locale);
  const name = iou.person;
  const act = (action: string) =>
    t('budgetGoalsIous.ious.actionFor', { action, person: name });
  return (
    <section
      aria-label={`${name} ${toMe ? t('budgetGoalsIous.ious.owesYouTag') : t('budgetGoalsIous.ious.youOweTag')} ${date}`}
      className="mb-3"
    >
      <div className="-mx-3">
        <Row
          columns={historyColumns}
          cells={[
            <span key="d" className="text-text-muted">
              {formatTerminalDate(iou.recordedOn, locale)}
            </span>,
            <span key="k" className="font-sans">
              {toMe
                ? t('budgetGoalsIous.ious.lentKind')
                : t('budgetGoalsIous.ious.borrowedKind')}
              <span className="text-text-muted">
                {' · '}
                {iou.dueOn === null
                  ? t('budgetGoalsIous.ious.noDue')
                  : t('budgetGoalsIous.ious.dueOn', {
                      date: formatTerminalDate(iou.dueOn, locale),
                    })}
              </span>
            </span>,
            <span key="t" className="flex gap-1">
              {iou.settled ? (
                <Tag tone="positive">
                  {t('budgetGoalsIous.ious.settledTag')}
                </Tag>
              ) : null}
              {iou.overdue ? (
                <Tag tone="negative">
                  {t('budgetGoalsIous.ious.overdueTag', {
                    count: iou.daysOverdue,
                  })}
                </Tag>
              ) : null}
            </span>,
            <Amount
              key="a"
              amount={signed(iou.amount, toMe)}
              kind="change"
              locale={locale}
            />,
          ]}
        />
        {payments.map((s) => {
          const kind = kindLabel(s, iou);
          const shown = formatMoney(s.amount, 'symbol', locale);
          const when = formatDay(s.on, locale);
          return (
            <Row
              key={s.id}
              columns={historyColumns}
              cells={[
                <span key="d" className="text-text-muted">
                  {formatTerminalDate(s.on, locale)}
                </span>,
                <span key="k" className="font-sans">
                  {kind}
                </span>,
                <BracketButton
                  key="x"
                  tone="destructive"
                  aria-label={t('budgetGoalsIous.ious.deletePayment', {
                    kind: kind.toLowerCase(),
                    amount: shown,
                    date: when,
                  })}
                  isDisabled={remove.isPending}
                  onPress={() => {
                    remove.mutate(s.transactionId);
                  }}
                >
                  {t('budgetGoalsIous.ious.delete')}
                </BracketButton>,
                <Amount
                  key="a"
                  amount={signed(s.amount, !toMe)}
                  kind="change"
                  locale={locale}
                />,
              ]}
            />
          );
        })}
      </div>
      {payments.length === 0 ? (
        <p className="pt-1 font-sans text-small text-text-muted">
          {t('budgetGoalsIous.ious.noPayments')}
        </p>
      ) : null}
      {remove.isError ? (
        <p role="alert" className="pt-1 text-small text-negative">
          {describeProblem(remove.error).message}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t pt-2.5">
        {iou.settled ? null : (
          <>
            <BracketButton
              icon={IconCheckLine}
              aria-label={act(
                toMe
                  ? t('budgetGoalsIous.ious.repay')
                  : t('budgetGoalsIous.ious.payBack'),
              )}
              onPress={() => {
                onFlow({ kind: 'repay', iou });
              }}
            >
              {toMe
                ? t('budgetGoalsIous.ious.repay')
                : t('budgetGoalsIous.ious.payBack')}
            </BracketButton>
            <BracketButton
              icon={IconCalendar2Line}
              aria-label={act(t('budgetGoalsIous.ious.dueDate'))}
              onPress={() => {
                onFlow({ kind: 'due', iou });
              }}
            >
              {t('budgetGoalsIous.ious.dueDate')}
            </BracketButton>
            {toMe ? (
              <BracketButton
                tone="destructive"
                aria-label={act(t('budgetGoalsIous.ious.writeOff'))}
                onPress={() => {
                  onFlow({ kind: 'writeoff', iou });
                }}
              >
                {t('budgetGoalsIous.ious.writeOff')}
              </BracketButton>
            ) : null}
          </>
        )}
        <BracketButton
          tone="destructive"
          aria-label={act(t('budgetGoalsIous.ious.deleteEntry'))}
          onPress={() => {
            onFlow({ kind: 'delete', iou });
          }}
        >
          {t('budgetGoalsIous.ious.deleteEntry')}
        </BracketButton>
      </div>
    </section>
  );
}
