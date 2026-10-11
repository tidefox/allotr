import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { AccountView, Money } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { Bar, seriesBg, seriesText } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { MenuButton, MenuItem } from '@/components/menu';
import { TreeRow } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { Sparkline } from '@/charts/sparkline';
import type { ChartColor } from '@/charts/chart';
import { formatTerminalDate } from '@/features/today/format';
import {
  IconAddLine,
  IconBankCardLine,
  IconCheckLine,
  IconStackLine,
  IconMore2Line,
  IconSafe2Line,
  IconWallet3Line,
  type IconProps,
} from '@/generated/icons';
import { accountHistoryQuery } from '@/lib/ledger';
import { sparkPoints } from '@/lib/spark-points';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import {
  CREDIT_GROUP,
  NO_POOL_GROUP,
  type AccountGroup,
} from './accounts-model.ts';

const locale = 'en';

export type RowAction =
  'reconcile' | 'transfer' | 'rename' | 'move' | 'archive';

// The mockup's tree row: icon and name (one button, so the whole name
// selects), a sparkline or the pool's cycle bar from 600 px, the reconciled
// date from 1000 px, the balance and a `[+]` or `[⋮]` action. The tree's 24 px lead
// column comes from TreeRow.
const columns: readonly RowColumn[] = [
  {
    width: 'minmax(0, 1fr)',
    at: { wide: 'minmax(calc(1.75rem + 12ch), 1fr)' },
  },
  {
    width: 'minmax(3.125rem, 6.875rem)',
    at: { wide: 'minmax(3.75rem, 10rem)' },
    from: 'medium',
  },
  { width: '9ch', from: 'wide' },
  { width: '12ch' },
  // The mockup's 26 px track lets `[+]` overflow it; auto fits it instead.
  { width: 'auto' },
];

/** True once the element has been on screen; history loads only then. */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el === null || seen) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [seen]);
  return [ref, seen] as const;
}

/** A debt's line is `negative`; otherwise the pool's colour. */
export function lineColour(
  balance: Money,
  colour: AccountGroup['color'],
): ChartColor {
  if (balance.amountMinor < 0) return 'negative';
  return colour ?? 'series-1';
}

function Trend({
  account,
  color,
}: {
  account: AccountView;
  color: ChartColor;
}) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const history = useQuery({
    ...accountHistoryQuery(account.id),
    enabled: seen,
  });
  const points =
    history.data === undefined ? [] : sparkPoints(history.data.points);
  return (
    <div ref={ref} className="min-h-[1.2rem]">
      {points.length < 2 ? null : (
        <Sparkline
          points={points}
          color={color}
          label={t('accountsScreen.list.sparkline', { name: account.name })}
          // The mockup's 200 × 24 line, as wide as the column.
          className="aspect-[25/3] h-auto"
        />
      )}
    </div>
  );
}

/** A balance on the right, `negative` while it is below zero. */
function Balance({ amount }: { amount: Money }) {
  return (
    <span
      className={cn(
        'block text-right',
        amount.amountMinor < 0 && 'text-negative',
      )}
    >
      <Amount amount={amount} locale={locale} />
    </span>
  );
}

/** The account's kind icon; the API has no icon per account. */
export function accountIcon(account: AccountView): ComponentType<IconProps> {
  return account.kind === 'liability' ? IconBankCardLine : IconWallet3Line;
}

/** `accountIcon` as an element, decorative. */
export function AccountIcon({
  account,
  className,
}: {
  account: AccountView;
  className?: string;
}) {
  return account.kind === 'liability' ? (
    <IconBankCardLine aria-hidden="true" className={className} />
  ) : (
    <IconWallet3Line aria-hidden="true" className={className} />
  );
}

function AccountRow({
  account,
  color,
  last,
  selected,
  onSelect,
  onAction,
}: {
  account: AccountView;
  color: AccountGroup['color'];
  last: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onAction: (action: RowAction, account: AccountView) => void;
}) {
  return (
    <TreeRow
      role={last ? 'last-child' : 'child'}
      label={account.name}
      selected={selected}
      tall
      columns={columns}
      cells={[
        <button
          key="name"
          type="button"
          aria-current={selected ? 'true' : undefined}
          onClick={() => {
            onSelect(account.id);
          }}
          className="press flex h-full min-h-hit w-full min-w-0 items-center gap-2.5 text-left"
        >
          <AccountIcon
            account={account}
            className="size-4 shrink-0 text-text-muted"
          />
          <span className="min-w-0 truncate font-sans">{account.name}</span>
        </button>,
        <Trend
          key="trend"
          account={account}
          color={lineColour(account.balance, color)}
        />,
        <span
          key="date"
          className="flex min-w-0 items-center gap-1 font-sans text-text-muted"
        >
          {account.lastReconciledOn === null ? (
            t('accountsScreen.list.notReconciled')
          ) : (
            <>
              <IconCheckLine aria-hidden="true" className="size-4 shrink-0" />
              <span className="sr-only">
                {t('accountsScreen.list.reconciled')}
              </span>
              <span className="truncate">
                {formatTerminalDate(account.lastReconciledOn, locale)}
              </span>
            </>
          )}
        </span>,
        <Balance key="balance" amount={account.balance} />,
        <MenuButton
          key="menu"
          variant="bracket"
          icon={IconMore2Line}
          label={t('accountsScreen.list.actionsOf', { name: account.name })}
          title={account.name}
        >
          <MenuItem
            id="reconcile"
            label={t('accountsScreen.menu.reconcile')}
            onAction={() => {
              onAction('reconcile', account);
            }}
          />
          <MenuItem
            id="transfer"
            label={t('accountsScreen.menu.transfer')}
            onAction={() => {
              onAction('transfer', account);
            }}
          />
          <MenuItem
            id="rename"
            label={t('accountsScreen.menu.rename')}
            onAction={() => {
              onAction('rename', account);
            }}
          />
          <MenuItem
            id="move"
            label={t('accountsScreen.menu.move')}
            onAction={() => {
              onAction('move', account);
            }}
          />
          <MenuItem
            id="archive"
            label={t('accountsScreen.menu.archive')}
            onAction={() => {
              onAction('archive', account);
            }}
          />
        </MenuButton>,
      ]}
    />
  );
}

function groupName(group: AccountGroup): string {
  if (group.id === CREDIT_GROUP) return t('accountsScreen.list.credit');
  if (group.id === NO_POOL_GROUP) return t('accountsScreen.list.noPool');
  return group.name ?? '';
}

/** A group's kind icon in its colour (the API has no icon per pool). */
function GroupIcon({ group }: { group: AccountGroup }) {
  const color = group.color;
  const className = cn(
    'size-4 shrink-0',
    color === null
      ? 'text-text-muted'
      : color === 'negative'
        ? 'text-negative'
        : seriesText[color],
  );
  if (group.kind === 'credit')
    return <IconBankCardLine aria-hidden="true" className={className} />;
  if (group.poolKind === 'spending')
    return <IconWallet3Line aria-hidden="true" className={className} />;
  if (group.poolKind === 'savings')
    return <IconSafe2Line aria-hidden="true" className={className} />;
  return <IconStackLine aria-hidden="true" className={className} />;
}

/** `● daily`, `off-budget` or `owed` after a group's name. */
function GroupNote({ group }: { group: AccountGroup }) {
  if (group.kind === 'credit') return <>{t('accountsScreen.list.owed')}</>;
  if (group.counts)
    return (
      <>
        <span aria-hidden="true" className="text-positive">
          ●
        </span>{' '}
        {t('accountsScreen.list.daily')}
      </>
    );
  return <>{t('accountsScreen.list.offBudget')}</>;
}

/** Pools, then credit, each folding over its accounts. */
export function AccountList({
  groups,
  selectedId,
  onSelect,
  onAction,
  onAdd,
}: {
  groups: readonly AccountGroup[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onAction: (action: RowAction, account: AccountView) => void;
  onAdd: () => void;
}) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div>
      {groups.map((group) => {
        const open = !folded.has(group.id);
        const name = groupName(group);
        const color = group.color;
        return (
          <div key={group.id}>
            <TreeRow
              role="parent"
              expanded={open}
              onToggle={() => {
                toggle(group.id);
              }}
              label={t('accountsScreen.list.fold', { name })}
              tall
              // The whole header row is semibold (`.r.parent`).
              className="font-semibold"
              columns={columns}
              cells={[
                <span
                  key="name"
                  className="flex min-w-0 items-center gap-2.5 font-sans"
                >
                  <GroupIcon group={group} />
                  <span className="min-w-0 truncate">
                    {name}{' '}
                    <span className="font-normal text-text-muted">
                      <GroupNote group={group} />
                    </span>
                  </span>
                </span>,
                group.cycleFraction === null ? null : (
                  <Bar
                    key="bar"
                    value={group.cycleFraction}
                    label={t('accountsScreen.list.cycleLeft', { name })}
                    {...(color === null || color === 'negative'
                      ? {}
                      : { fillClassName: seriesBg[color] })}
                  />
                ),
                null,
                group.balance === null ? null : (
                  <Balance key="balance" amount={group.balance} />
                ),
                <BracketButton
                  key="add"
                  icon={IconAddLine}
                  aria-label={t('accountsScreen.list.addTo')}
                  onPress={onAdd}
                >
                  {null}
                </BracketButton>,
              ]}
            />
            {open
              ? group.accounts.map((account, index) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    color={color}
                    last={index === group.accounts.length - 1}
                    selected={account.id === selectedId}
                    onSelect={onSelect}
                    onAction={onAction}
                  />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
