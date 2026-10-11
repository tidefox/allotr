import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Amount } from '@/components/amount';
import { formatSigned } from '@/lib/format-money';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, Tag } from '@/components/buttons';
import { Split, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { Sheet } from '@/components/sheet';
import { EmptyState } from '@/components/states';
import { useFrameWidth } from '@/components/use-frame-width';
import { IconAddLine, IconHandCoinLine } from '@/generated/icons';
import { formatTerminalDate } from '@/features/today/format';
import { allIousQuery } from '@/lib/ious';
import { t } from '@/messages/t';
import { PersonDetail } from './iou-detail.tsx';
import { IouSheet, type IouFlow } from './iou-sheets.tsx';
import {
  groupPeople,
  nextDue,
  personFigure,
  type Person,
} from './ious-model.ts';
import { SumLine } from './sum-line.tsx';
import { TabFailed } from './tab-failed.tsx';

const locale = 'en';

// Icon, name with the direction, status tag, figure (`rows tall`).
const columns: readonly RowColumn[] = [
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
  { width: '12ch' },
];

function direction(person: Person): string {
  if (person.settled) return t('budgetGoalsIous.ious.even');
  return [
    person.owedToMe.length > 0 ? t('budgetGoalsIous.ious.owesYouTag') : null,
    person.owedByMe.length > 0 ? t('budgetGoalsIous.ious.youOweTag') : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

function StatusTag({ person }: { person: Person }) {
  if (person.settled)
    return <Tag tone="positive">{t('budgetGoalsIous.ious.settledTag')}</Tag>;
  if (person.daysOverdue > 0)
    return (
      <Tag tone="negative">
        {t('budgetGoalsIous.ious.overdueTag', { count: person.daysOverdue })}
      </Tag>
    );
  const due = nextDue(person);
  return due === null ? null : <Tag>{formatTerminalDate(due, locale)}</Tag>;
}

function PersonRow({
  person,
  selected,
  onSelect,
}: {
  person: Person;
  selected: boolean;
  onSelect: () => void;
}) {
  const figure = personFigure(person);
  return (
    <Row
      columns={columns}
      selected={selected}
      onPress={onSelect}
      tall
      cells={[
        <IconHandCoinLine
          key="i"
          aria-hidden="true"
          className="size-4 text-text-muted"
        />,
        <span key="name" className="font-sans">
          {person.name}{' '}
          <span className="text-text-muted">{direction(person)}</span>
        </span>,
        <StatusTag key="tag" person={person} />,
        <span key="figure" className="block text-right">
          {figure === null ? (
            <span className="text-text-muted">
              {t('budgetGoalsIous.ious.openMany', {
                count: person.open.length,
              })}
            </span>
          ) : (
            <Amount
              amount={figure.amount}
              locale={locale}
              className={
                person.settled
                  ? 'text-text-muted'
                  : figure.toMe
                    ? 'text-positive'
                    : 'text-negative'
              }
            />
          )}
        </span>,
      ]}
    />
  );
}

// IOUs (docs/ui.md §6): the people list and, beside it from 1000 px or in a
// sheet, the open person's IOUs, payments and actions. Totals and every
// amount are the server's; a person's open IOUs are never added up here.
export function IousTab() {
  const ious = useQuery(allIousQuery);
  const wide = useFrameWidth() >= 1000;
  const [selected, setSelected] = useState<string | null>(null);
  const [flow, setFlow] = useState<IouFlow | null>(null);

  const list = ious.data?.ious;
  const people = useMemo(
    () => (list === undefined ? undefined : groupPeople(list, true)),
    [list],
  );
  const person =
    selected === null ? undefined : people?.find((p) => p.key === selected);

  let body;
  if (ious.isError) {
    body = (
      <TabFailed
        retry={() => {
          void ious.refetch();
        }}
      />
    );
  } else if (people === undefined || ious.data === undefined) {
    body = <SkeletonTile />;
  } else if (people.length === 0) {
    body = (
      <EmptyState
        title={t('budgetGoalsIous.ious.empty')}
        hint={t('budgetGoalsIous.ious.emptyHint')}
      />
    );
  } else {
    const { totals } = ious.data;
    body = (
      <>
        <SumLine
          className="px-3 pt-2"
          parts={[
            {
              key: 'to-me',
              label: t('budgetGoalsIous.ious.owedToYou'),
              value: <Amount amount={totals.owedToMe} locale={locale} />,
              tone: 'positive',
            },
            {
              key: 'by-me',
              label: t('budgetGoalsIous.ious.youOweTag'),
              value: <Amount amount={totals.owedByMe} locale={locale} />,
              tone: 'negative',
            },
            {
              key: 'net',
              label: t('budgetGoalsIous.ious.net'),
              value: formatSigned(totals.net, 'symbol', locale),
            },
          ]}
        />
        {people.map((p) => (
          <PersonRow
            key={p.key}
            person={p}
            selected={p.key === selected}
            onSelect={() => {
              setSelected(p.key === selected ? null : p.key);
            }}
          />
        ))}
      </>
    );
  }

  const detail =
    person === undefined ? null : (
      <PersonDetail person={person} onFlow={setFlow} />
    );

  return (
    <>
      <Split
        className="min-h-full"
        list={
          <Tile
            title={t('budgetGoalsIous.ious.title')}
            icon={IconHandCoinLine}
            className="h-full"
            bodyClassName="px-0 pt-0 pb-0"
            actions={
              <>
                <BracketButton
                  icon={IconAddLine}
                  aria-label={t('budgetGoalsIous.ious.lendLabel')}
                  onPress={() => {
                    setFlow({ kind: 'loan', direction: 'owed-to-me' });
                  }}
                >
                  {t('budgetGoalsIous.ious.lend')}
                </BracketButton>
                <BracketButton
                  icon={IconAddLine}
                  aria-label={t('budgetGoalsIous.ious.borrowLabel')}
                  onPress={() => {
                    setFlow({ kind: 'loan', direction: 'owed-by-me' });
                  }}
                >
                  {t('budgetGoalsIous.ious.borrow')}
                </BracketButton>
              </>
            }
          >
            {body}
          </Tile>
        }
        detail={
          wide ? (
            <Tile
              title={person?.name ?? t('budgetGoalsIous.ious.detailTitle')}
              icon={IconHandCoinLine}
              primary={person !== undefined}
              className="h-full"
            >
              {detail ?? (
                <p className="font-sans text-text-muted">
                  {t('budgetGoalsIous.ious.pickOne')}
                </p>
              )}
            </Tile>
          ) : null
        }
      />
      {wide ? null : (
        <Sheet
          isOpen={person !== undefined}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title={person?.name ?? t('budgetGoalsIous.ious.detailTitle')}
          closeLabel={t('budgetGoalsIous.ious.closeDetail')}
        >
          <div className="p-3">{detail}</div>
        </Sheet>
      )}
      <IouSheet
        flow={flow}
        onClose={() => {
          setFlow(null);
        }}
      />
    </>
  );
}
