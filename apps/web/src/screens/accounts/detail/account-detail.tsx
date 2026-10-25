import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { AccountView, Money, PoolView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { LeftBar, SkeletonTile, seriesText } from '@/components/bars';
import {
  BracketButton,
  Brackets,
  Tag,
  bracketClass,
} from '@/components/buttons';
import { SectionTitle, Tile } from '@/components/layout';
import { MenuButton, MenuItem } from '@/components/menu';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon } from '@/components/states';
import { Chart } from '@/charts/chart';
import { formatDay, formatTerminalDate } from '@/features/today/format';
import { ledgerRows } from '@/features/ledger/rows';
import {
  IconArrowLeftRightLine,
  IconCheckLine,
  IconMoneyDollarCircleLine,
  IconMore2Line,
  IconPencilLine,
} from '@/generated/icons';
import { call } from '@/lib/api';
import { poolsQuery } from '@/lib/budgets';
import { seriesNumber } from '@/lib/category-style';
import { endpoints } from '@/lib/endpoints';
import { formatMoney } from '@/lib/format-money';
import {
  accountHistoryQuery,
  allAccountsQuery,
  allCategoriesQuery,
} from '@/lib/ledger';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { barFraction } from '@/shell/summary-math';
import {
  AccountIcon,
  accountIcon,
  lineColour,
  type RowAction,
} from '../account-list.tsx';
import { accountColour } from '../accounts-model.ts';
import { historyChart } from './detail-model.ts';

const locale = 'en';
const DAYS = 30;
const RECENT = 5;

// The mockup's recent row: date, category icon, payee, amount.
const recentColumns: readonly RowColumn[] = [
  { width: '7ch' },
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
];

function recentQuery(accountId: string) {
  return queryOptions({
    // Under ['transactions'], so any new entry refreshes it.
    queryKey: ['transactions', 'account-recent', accountId],
    queryFn: () =>
      call(endpoints.transactions, {
        query: { accountId, undone: 'hide', limit: RECENT },
      }),
  });
}

/** The `account` tile (primary edge) beside the list, or a plain region in a sheet. */
function DetailFrame({
  bare,
  account,
  children,
}: {
  bare: boolean;
  account: AccountView | undefined;
  children: ReactNode;
}) {
  if (bare) {
    return (
      <section aria-label={t('accountDetail.title')} className="px-3 py-2.5">
        {children}
      </section>
    );
  }
  return (
    <Tile
      title={t('accountDetail.title')}
      icon={account === undefined ? undefined : accountIcon(account)}
      subtitle={
        account === undefined
          ? undefined
          : t(`accountDetail.kinds.${account.kind}`)
      }
      primary
      className="h-full"
      bodyClassName="flex flex-col"
      scroll={t('accountDetail.scroll')}
    >
      {children}
    </Tile>
  );
}

/**
 * One account in full (docs/ui.md §6): name and balance, its history, where
 * it sits, its latest entries, then reconcile, transfer, edit and more. The
 * accounts screen renders it in the pane (≥ 1000 px) or bare in a sheet,
 * owns the selection and opens the action sheets.
 */
export function AccountDetail({
  accountId,
  bare = false,
  onAction,
}: {
  accountId: string;
  bare?: boolean;
  onAction: (action: RowAction, account: AccountView) => void;
}) {
  const accounts = useQuery(allAccountsQuery);
  const pools = useQuery(poolsQuery);

  if (accounts.isError) {
    return (
      <DetailFrame bare={bare} account={undefined}>
        <div role="alert" className="flex flex-col items-start gap-2 py-3">
          <p className="text-small">{t('accountDetail.failed')}</p>
          <BracketButton
            onPress={() => {
              void accounts.refetch();
            }}
          >
            {t('accountDetail.retry')}
          </BracketButton>
        </div>
      </DetailFrame>
    );
  }
  const account = accounts.data?.accounts.find((a) => a.id === accountId);
  if (accounts.data === undefined) return <SkeletonTile />;
  if (account === undefined) {
    return (
      <DetailFrame bare={bare} account={undefined}>
        <p role="alert" className="py-3 text-small">
          {t('accountDetail.failed')}
        </p>
      </DetailFrame>
    );
  }

  const list = pools.data?.pools ?? [];
  const pool = list.find((p) => p.id === account.poolId);
  const colour = accountColour(account, list);
  return (
    <DetailFrame bare={bare} account={account}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 self-center font-sans font-semibold">
          <AccountIcon
            account={account}
            className={cn(
              'size-4 shrink-0',
              colour === null
                ? 'text-text-muted'
                : colour === 'negative'
                  ? 'text-negative'
                  : seriesText[colour],
            )}
          />
          <span className="truncate">{account.name}</span>
          {account.archived ? (
            <Tag>{t('accountDetail.tags.archived')}</Tag>
          ) : null}
        </h3>
        <span
          className={cn(
            'shrink-0 text-big leading-[1.15] font-semibold tracking-[-0.01em]',
            account.balance.amountMinor < 0 && 'text-negative',
          )}
        >
          <Amount amount={account.balance} locale={locale} />
        </span>
      </div>

      {account.creditLimit === null ||
      account.creditAvailable === null ? null : (
        <CreditLine
          limit={account.creditLimit}
          available={account.creditAvailable}
        />
      )}

      <History account={account} colour={colour} grow={!bare} />

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5">
        <Field label={t('accountDetail.fields.pool')}>
          {poolText(account, pool)}
        </Field>
        <Field label={t('accountDetail.fields.type')}>
          {t('accountDetail.typeLine', {
            kind: account.subtype ?? t(`accountDetail.kinds.${account.kind}`),
            currency: account.currency,
          })}
        </Field>
        {account.creditLimit === null ? null : (
          <Field label={t('accountDetail.fields.limit')}>
            <Amount amount={account.creditLimit} locale={locale} />
          </Field>
        )}
        {account.minPayment === null ? null : (
          <Field label={t('accountDetail.fields.minPayment')}>
            <Amount amount={account.minPayment} locale={locale} />
          </Field>
        )}
        {account.nextDueOn === null ? null : (
          <Field label={t('accountDetail.fields.due')}>
            {formatTerminalDate(account.nextDueOn, locale)}
          </Field>
        )}
        <Field label={t('accountDetail.fields.reconciled')}>
          {account.lastReconciledOn === null ? (
            t('accounts.neverReconciled')
          ) : (
            <span className="inline-flex max-w-full items-center gap-[5px] align-bottom">
              <IconCheckLine aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">
                {t(
                  account.reconcileDue
                    ? 'accountDetail.reconciledDue'
                    : 'accountDetail.reconciledUpToDate',
                  {
                    date: formatTerminalDate(account.lastReconciledOn, locale),
                  },
                )}
              </span>
            </span>
          )}
        </Field>
      </dl>

      <Recent accountId={account.id} />

      {account.archived ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t pt-2.5">
          <BracketButton
            icon={IconCheckLine}
            onPress={() => {
              onAction('reconcile', account);
            }}
          >
            {t('accountDetail.actions.reconcile')}
          </BracketButton>
          <BracketButton
            icon={IconArrowLeftRightLine}
            onPress={() => {
              onAction('transfer', account);
            }}
          >
            {t('accountDetail.actions.transfer')}
          </BracketButton>
          <BracketButton
            icon={IconPencilLine}
            onPress={() => {
              onAction('rename', account);
            }}
          >
            {t('accountDetail.actions.edit')}
          </BracketButton>
          <MenuButton
            variant="bracket"
            icon={IconMore2Line}
            label={t('accountDetail.actions.more', { name: account.name })}
            title={account.name}
          >
            <MenuItem
              id="move"
              label={t('accountDetail.actions.move')}
              onAction={() => {
                onAction('move', account);
              }}
            />
            <MenuItem
              id="archive"
              label={t('accountDetail.actions.archive')}
              onAction={() => {
                onAction('archive', account);
              }}
            />
          </MenuButton>
        </div>
      )}
    </DetailFrame>
  );
}

/**
 * What is free of a card's limit, as the server worked it out (limit plus
 * balance, so negative past the limit), under a "left of" bar. The bar only
 * sizes the ratio of the two server figures.
 */
function CreditLine({ limit, available }: { limit: Money; available: Money }) {
  return (
    <div className="mt-2">
      <LeftBar
        fraction={barFraction(available.amountMinor, limit.amountMinor)}
        height={4}
        label={t('accountDetail.credit.bar')}
      />
      <p className="num truncate pt-0.5 text-tiny text-text-muted">
        {t('accountDetail.credit.free', {
          free: formatMoney(available, 'symbol', locale),
          limit: formatMoney(limit, 'symbol', locale),
        })}
      </p>
    </div>
  );
}

/** `Budget · counts toward daily`, `Savings · off-budget` or `credit`. */
function poolText(account: AccountView, pool: PoolView | undefined): string {
  if (account.kind === 'liability') return t('accountDetail.creditPool');
  if (pool === undefined) return '…';
  return t(pool.counts ? 'accountDetail.poolCounts' : 'accountDetail.poolOff', {
    pool: pool.name,
  });
}

/** A key-value row (`kv`): muted key, value right-aligned on one line. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-sans">{children}</dd>
    </>
  );
}

function History({
  account,
  colour,
  grow,
}: {
  account: AccountView;
  colour: ReturnType<typeof accountColour>;
  grow: boolean;
}) {
  const history = useQuery(accountHistoryQuery(account.id, DAYS));
  const name = account.name;
  if (history.isError)
    return (
      <p role="alert" className="my-2.5 text-small text-negative">
        {t('accountDetail.history.failed')}
      </p>
    );
  const points = history.data?.points;
  if (points === undefined) return <SkeletonTile />;
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined)
    return (
      <p className="my-2.5 text-small text-text-muted">
        {t('accountDetail.history.empty')}
      </p>
    );
  const chart = historyChart(points, locale);
  return (
    <div
      className={cn('mt-2.5 mb-1.5', grow && 'flex min-h-0 flex-1 flex-col')}
    >
      <Chart
        label={t('accountDetail.history.summary', {
          name,
          days: DAYS,
          start: formatMoney(first.balance, 'symbol', locale),
          end: formatMoney(last.balance, 'symbol', locale),
        })}
        series={[
          {
            id: 'balance',
            label: t('accountDetail.history.balance'),
            color: lineColour(account.balance, colour),
            points: chart.points,
            area: true,
            marker: false,
            hoverLabels: points.map(
              (p) =>
                `${formatTerminalDate(p.date, locale)} · ${formatMoney(p.balance, 'symbol', locale)}`,
            ),
          },
        ]}
        yTicks={chart.yTicks}
        xTicks={chart.xTicks}
        height={110}
        grow={grow}
        className="px-0 py-0"
        table={{
          caption: t('accountDetail.history.caption'),
          headers: [
            t('accountDetail.history.day'),
            t('accountDetail.history.balance'),
          ],
          rows: points.map((p) => [
            formatDay(p.date, locale),
            formatMoney(p.balance, 'symbol', locale),
          ]),
        }}
      />
    </div>
  );
}

/** The latest entries touching the account; each opens in Transactions. */
function Recent({ accountId }: { accountId: string }) {
  const navigate = useNavigate();
  const entries = useQuery(recentQuery(accountId));
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);

  const body = () => {
    if (entries.isError)
      return (
        <p role="alert" className="px-3 text-small text-negative">
          {t('accountDetail.recent.failed')}
        </p>
      );
    if (
      entries.data === undefined ||
      accounts.data === undefined ||
      categories.data === undefined
    )
      return null;
    const rows = ledgerRows(
      entries.data.transactions,
      accounts.data.accounts,
      categories.data.categories,
    );
    if (rows.length === 0)
      return (
        <p className="flex min-h-row items-center px-3 text-text-muted">
          {t('accountDetail.recent.empty')}
        </p>
      );
    return rows.map((row) => {
      const title = row.note ?? row.title ?? t(`ledger.kinds.${row.kind}`);
      const colour =
        row.style === null ? undefined : seriesNumber(row.style.colour);
      return (
        <Row
          key={row.id}
          columns={recentColumns}
          onPress={() => {
            void navigate({ to: '/transactions', search: { entry: row.id } });
          }}
          cells={[
            <span key="day" className="font-sans text-text-muted">
              {formatTerminalDate(row.occurredOn, locale)}
            </span>,
            row.style?.icon == null ? (
              <IconMoneyDollarCircleLine
                key="icon"
                aria-hidden="true"
                className="block size-4 text-text-muted"
              />
            ) : (
              <CategoryIcon
                key="icon"
                name={row.style.icon}
                {...(colour === undefined ? {} : { color: colour })}
              />
            ),
            <span key="title" className="font-sans">
              {title}
            </span>,
            row.amount === null ? null : (
              <Amount
                key="amount"
                amount={row.amount}
                kind={
                  row.moves
                    ? 'transfer'
                    : row.amount.amountMinor < 0
                      ? 'expense'
                      : 'income'
                }
                locale={locale}
              />
            ),
          ]}
        />
      );
    });
  };

  return (
    <section
      aria-label={t('accountDetail.recent.title')}
      className="-mx-3 flex flex-col [&>:last-child]:border-b-0"
    >
      <div className="flex items-center justify-between gap-2 px-3">
        <SectionTitle>{t('accountDetail.recent.title')}</SectionTitle>
        <Link
          to="/transactions"
          search={{ accounts: [accountId], period: 'all' }}
          className={cn(bracketClass, 'mt-2')}
        >
          <Brackets>{t('accountDetail.recent.all')}</Brackets>
        </Link>
      </div>
      {body()}
    </section>
  );
}
