import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon, EmptyState } from '@/components/states';
import {
  IconFileList3Line,
  IconMoneyDollarCircleLine,
} from '@/generated/icons';
import { seriesNumber } from '@/lib/category-style';
import { formatMoney } from '@/lib/format-money';
import {
  accountsQuery,
  categoriesQuery,
  entriesOnQuery,
  todayQuery,
} from '@/lib/ledger';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import { dashboardEntries, entryAmountKind } from './todays-entries-model.ts';

const locale = 'en';

const columns: readonly RowColumn[] = [
  { width: '5ch' },
  { width: '1.125rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
];

// Today's entries (docs/ui.md §6): time, icon, payee with its category,
// amount; the title bar counts them and shows the server's spent today.
export function TodaysEntriesTile() {
  const today = useQuery(todayQuery);
  const entries = useQuery(entriesOnQuery(today.data?.today));
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const title = t('dashboardTiles.todaysEntries.title');

  if (
    today.isError ||
    entries.isError ||
    accounts.isError ||
    categories.isError
  ) {
    return (
      <Tile title={title}>
        <TileFailed
          retry={() => {
            void today.refetch();
            void entries.refetch();
            void accounts.refetch();
            void categories.refetch();
          }}
        />
      </Tile>
    );
  }
  if (
    entries.data === undefined ||
    accounts.data === undefined ||
    categories.data === undefined
  ) {
    return <SkeletonTile />;
  }

  const rows = dashboardEntries(
    entries.data.transactions,
    accounts.data.accounts,
    categories.data.categories,
  );

  return (
    <Tile
      title={title}
      icon={IconFileList3Line}
      subtitle={
        rows.length === 0 || today.data === undefined
          ? undefined
          : t('dashboardTiles.todaysEntries.subtitle', {
              count: rows.length,
              spent: formatMoney(today.data.spentToday, 'symbol', locale),
            })
      }
      bodyClassName="px-0 pb-0"
    >
      {rows.length === 0 ? (
        <EmptyState
          title={t('dashboardTiles.todaysEntries.empty')}
          hint={t('dashboardTiles.todaysEntries.emptyHint')}
        />
      ) : (
        <div>
          {rows.map((row) => {
            const colour =
              row.style === null ? undefined : seriesNumber(row.style.colour);
            return (
              <Row
                key={row.id}
                columns={columns}
                cells={[
                  <span key="time" className="num text-text-muted">
                    {row.time ?? t('dashboardTiles.todaysEntries.noTime')}
                  </span>,
                  row.style?.icon == null ? (
                    <IconMoneyDollarCircleLine
                      key="icon"
                      className="size-4 text-text-muted"
                    />
                  ) : (
                    <CategoryIcon
                      key="icon"
                      name={row.style.icon}
                      {...(colour === undefined ? {} : { color: colour })}
                    />
                  ),
                  <span key="payee" className="font-sans">
                    {row.payee}
                    {row.category === null ? null : (
                      <span className="text-small text-text-muted">
                        {' · '}
                        {row.category}
                      </span>
                    )}
                  </span>,
                  row.amount === null ? null : (
                    <Amount
                      key="amount"
                      amount={row.amount}
                      kind={entryAmountKind(row)}
                      locale={locale}
                    />
                  ),
                ]}
              />
            );
          })}
        </div>
      )}
    </Tile>
  );
}
