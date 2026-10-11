import type {
  AccountView,
  CategoryView,
  Money,
  TransactionListView,
  TransactionView,
} from '@allotr/shared';
import { rowTitle } from '@/features/ledger/format';
import { formatTerminalDay } from '@/features/today/format';
import { ledgerRows, type LedgerKind } from '@/features/ledger/rows';
import { entryCategoryIds } from '@/lib/entry-categories';
import { type CategoryStyle } from '@/lib/category-style';
import { formatMoney, formatSigned } from '@/lib/format-money';
import { t } from '@/messages/t';
import { isDateSort, type Group, type Sort } from './search-params.ts';

type EntryTotals = TransactionListView['totals'];
type ListEntry = TransactionListView['transactions'][number];

// The Transactions list as sections of rows. Every figure comes from the
// server (`totals`, `groups`, `dayTotals`); this file only orders, labels
// and formats them.

export interface TxRow {
  id: string;
  kind: LedgerKind;
  /** `HH:MM`, or null when the entry has no time of day. */
  time: string | null;
  payee: string;
  /** `Parent › Category`, "Split: …", or null. */
  category: string | null;
  /** The parent (shown muted) and the category's own name; null for a split. */
  categoryParts: { parent: string | null; name: string } | null;
  /** One account, or `from → to` for a transfer. */
  account: string;
  /** Signed from the user's side; unsigned for a transfer. */
  amount: Money | null;
  /** The bill this payment settled, by name. */
  bill: string | null;
  moves: boolean;
  /** Deleted and shown anyway, or an undo. */
  undo: boolean;
  style: CategoryStyle | null;
}

export interface TxSection {
  key: string;
  /** Null for an ungrouped list: no header row. */
  title: string | null;
  /** The group's figure, formatted by the server's own numbers. */
  total: string | null;
  rows: TxRow[];
}

/** One category's parent and own name; null for none or a split. */
export function entryCategoryParts(
  entry: TransactionView,
  categories: readonly CategoryView[],
): { parent: string | null; name: string } | null {
  const ids = entryCategoryIds(entry);
  const [id] = ids;
  if (ids.length !== 1 || id === undefined) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const category = byId.get(id);
  if (category === undefined) return null;
  const parent =
    category.parentId === null ? undefined : byId.get(category.parentId);
  return { parent: parent?.name ?? null, name: category.name };
}

/** `Parent › Category` for one category; a split lists its names. */
export function entryCategoryLabel(
  entry: TransactionView,
  categories: readonly CategoryView[],
): string | null {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const labels = entryCategoryIds(entry).flatMap((id) => {
    const category = byId.get(id);
    if (category === undefined) return [];
    const parent =
      category.parentId === null ? undefined : byId.get(category.parentId);
    return [
      parent === undefined
        ? category.name
        : `${parent.name} › ${category.name}`,
    ];
  });
  if (labels.length <= 1) return labels[0] ?? null;
  return t('entries.split', { names: labels.join(', ') });
}

export function txRows(
  transactions: readonly ListEntry[],
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): TxRow[] {
  const byId = new Map(transactions.map((e) => [e.id, e]));
  return ledgerRows(transactions, accounts, categories).map((row, index) => {
    const entry = transactions[index];
    const source =
      entry === undefined
        ? undefined
        : entry.reversesId === null
          ? entry
          : (byId.get(entry.reversesId) ?? entry);
    return {
      id: row.id,
      kind: row.kind,
      time: entry?.occurredTime?.slice(0, 5) ?? null,
      payee:
        row.kind === 'reversal' ? rowTitle(row) : (row.note ?? rowTitle(row)),
      category:
        source === undefined ? null : entryCategoryLabel(source, categories),
      categoryParts:
        source === undefined ? null : entryCategoryParts(source, categories),
      account: row.accounts.join(' → '),
      amount: row.amount,
      bill: entry?.billId == null ? null : (entry.billName ?? null),
      moves: row.moves,
      undo: row.kind === 'reversal',
      style: row.style,
    };
  });
}

/**
 * One figure of the summary line: `14 entries`, `spent $12.00`. The value
 * is set in bold; the count comes before its word, money after.
 */
export interface SummaryPart {
  key: string;
  label: string;
  value: string;
  valueFirst?: boolean;
  tone?: 'positive';
}

/** Spent, income and net, one block per currency, from the server. */
export function totalsParts(totals: EntryTotals): SummaryPart[] {
  return totals.byCurrency.flatMap((block) => {
    const currency = block.spent.currency;
    return [
      {
        key: `spent-${currency}`,
        label: t('transactions.list.spent'),
        value: formatMoney(block.spent),
      },
      {
        key: `income-${currency}`,
        label: t('transactions.list.income'),
        value: formatMoney(block.income),
        tone: 'positive' as const,
      },
      {
        key: `net-${currency}`,
        label: t('transactions.list.net'),
        value: formatSigned(block.net),
      },
    ];
  });
}

export function summaryParts(totals: EntryTotals): SummaryPart[] {
  return [
    {
      key: 'count',
      label: t('transactions.list.countLabel', { count: totals.count }),
      value: String(totals.count),
      valueFirst: true,
    },
    ...totalsParts(totals),
  ];
}

const UNCATEGORISED = '__none__';

/** A category group's own figure: what was spent, else what came in. */
export function groupTotal(totals: EntryTotals): string | null {
  const spent = totals.byCurrency
    .filter((b) => b.spent.amountMinor !== 0)
    .map((b) => formatMoney(b.spent));
  if (spent.length > 0) return spent.join(' · ');
  const income = totals.byCurrency
    .filter((b) => b.income.amountMinor !== 0)
    .map((b) => formatMoney(b.income));
  return income.length > 0 ? income.join(' · ') : null;
}

export function sections(input: {
  transactions: readonly ListEntry[];
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  group: Group;
  sort: Sort;
  /** The first page's figures; they cover every matching entry. */
  groups: TransactionListView['groups'];
  /** Every loaded page's day nets. */
  dayTotals: TransactionListView['dayTotals'];
  /** The user's today, to mark its day header. */
  today?: string | undefined;
  locale: string;
}): TxSection[] {
  const { transactions, accounts, categories, group, sort, locale } = input;
  const rows = txRows(transactions, accounts, categories);
  // Days mean nothing when the list runs by amount: one flat list.
  if (group === 'none' || (group === 'day' && !isDateSort(sort))) {
    return [{ key: 'all', title: null, total: null, rows }];
  }
  if (group === 'day') {
    const net = new Map(input.dayTotals.map((d) => [d.date as string, d.net]));
    const days: TxSection[] = [];
    rows.forEach((row, index) => {
      const day = transactions[index]?.occurredOn ?? '';
      const last = days.at(-1);
      if (last?.key === day) {
        last.rows.push(row);
        return;
      }
      const dayNet = net.get(day);
      const label = formatTerminalDay(day as never, locale);
      days.push({
        key: day,
        title:
          day === input.today
            ? t('transactions.list.today', { day: label })
            : label,
        total: dayNet === undefined ? null : formatSigned(dayNet),
        rows: [row],
      });
    });
    return days;
  }
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map(input.groups.map((g) => [g.key ?? UNCATEGORISED, g]));
  const found = new Map<string, TxSection>();
  rows.forEach((row, index) => {
    // The server says which groups an entry is counted in: a split is in
    // each of its categories, like the group totals.
    const keys = transactions[index]?.groupKeys ?? [];
    for (const groupKey of keys.length === 0 ? [null] : keys) {
      const key = groupKey ?? UNCATEGORISED;
      let section = found.get(key);
      if (section === undefined) {
        const category = byId.get(key);
        const parent =
          category?.parentId == null ? undefined : byId.get(category.parentId);
        const server = totals.get(key);
        section = {
          key,
          title:
            category === undefined
              ? t('transactions.list.uncategorised')
              : parent === undefined
                ? category.name
                : `${parent.name} › ${category.name}`,
          total: server === undefined ? null : groupTotal(server),
          rows: [],
        };
        found.set(key, section);
      }
      section.rows.push(row);
    }
  });
  return [...found.values()].sort((a, b) => {
    if (a.key === UNCATEGORISED) return 1;
    if (b.key === UNCATEGORISED) return -1;
    return (a.title ?? '').localeCompare(b.title ?? '');
  });
}
