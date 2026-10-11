import { idSchema } from '@allotr/shared';

// The Transactions screen keeps its filters, grouping and open entry in the
// URL (docs/ui.md §5), so back and forward work and a view can be
// bookmarked. Anything malformed is dropped. Defaults are left out of the
// URL.

export const PERIODS = [
  'all',
  'cycle',
  'last-cycle',
  'month',
  'last-month',
] as const;
export type Period = (typeof PERIODS)[number];

export const TYPES = ['expense', 'income', 'transfer'] as const;
export type EntryType = (typeof TYPES)[number];

export const GROUPS = ['day', 'category', 'none'] as const;
export type Group = (typeof GROUPS)[number];

export const SORTS = [
  'date-desc',
  'date-asc',
  'amount-desc',
  'amount-asc',
] as const;
export type Sort = (typeof SORTS)[number];

/** Day headers and day totals only make sense when the list runs by date. */
export const isDateSort = (sort: Sort) => sort.startsWith('date');

export const DEFAULT_PERIOD: Period = 'cycle';
export const DEFAULT_GROUP: Group = 'day';
export const DEFAULT_SORT: Sort = 'date-desc';

/** At most this many ids per filter, like the API. */
const MAX_IDS = 50;

export interface TransactionsSearch {
  q?: string | undefined;
  /** Entries of one payee, by the key the payee report ranks by. */
  payee?: string | undefined;
  period?: Period | undefined;
  type?: EntryType | undefined;
  categories?: string[] | undefined;
  accounts?: string[] | undefined;
  group?: Group | undefined;
  sort?: Sort | undefined;
  /** The entry shown in the detail pane or sheet. */
  entry?: string | undefined;
}

const oneOf = <T extends string>(
  options: readonly T[],
  value: unknown,
): T | undefined => options.find((option) => option === value);

const ids = (value: unknown): string[] | undefined => {
  const list: unknown[] = Array.isArray(value)
    ? (value as unknown[])
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const valid = [
    ...new Set(
      list.flatMap((item) => {
        const parsed = idSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  ].slice(0, MAX_IDS);
  return valid.length === 0 ? undefined : valid;
};

const text = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, 100);
  return trimmed === '' ? undefined : trimmed;
};

/** A payee as the report names it; notes can run longer than a search. */
const payee = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, 500);
  return trimmed === '' ? undefined : trimmed;
};

const id = (value: unknown) => {
  const parsed = idSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

// Every key is returned, even when undefined: the router merges the raw
// params underneath, so a missing key would let an unchecked value through.
export function validateTransactionsSearch(
  search: Record<string, unknown>,
): TransactionsSearch {
  const period = oneOf(PERIODS, search.period);
  const group = oneOf(GROUPS, search.group);
  const sort = oneOf(SORTS, search.sort);
  return {
    q: text(search.q),
    payee: payee(search.payee),
    period: period === DEFAULT_PERIOD ? undefined : period,
    type: oneOf(TYPES, search.type),
    categories: ids(search.categories),
    accounts: ids(search.accounts),
    group: group === DEFAULT_GROUP ? undefined : group,
    sort: sort === DEFAULT_SORT ? undefined : sort,
    entry: id(search.entry),
  };
}

/** The view a search describes, with defaults filled in. */
export interface TransactionsView {
  q: string | undefined;
  payee: string | undefined;
  period: Period;
  type: EntryType | undefined;
  categories: readonly string[];
  accounts: readonly string[];
  group: Group;
  sort: Sort;
  entry: string | undefined;
}

export function viewOf(search: TransactionsSearch): TransactionsView {
  return {
    q: search.q,
    payee: search.payee,
    period: search.period ?? DEFAULT_PERIOD,
    type: search.type,
    categories: search.categories ?? [],
    accounts: search.accounts ?? [],
    group: search.group ?? DEFAULT_GROUP,
    sort: search.sort ?? DEFAULT_SORT,
    entry: search.entry,
  };
}

/** A search from a view: defaults and empty lists are left out. */
export function searchOf(view: Partial<TransactionsView>): TransactionsSearch {
  const merged = { ...viewOf({}), ...view };
  return {
    q: merged.q === '' ? undefined : merged.q,
    payee: merged.payee === '' ? undefined : merged.payee,
    period: merged.period === DEFAULT_PERIOD ? undefined : merged.period,
    type: merged.type,
    categories:
      merged.categories.length === 0 ? undefined : [...merged.categories],
    accounts: merged.accounts.length === 0 ? undefined : [...merged.accounts],
    group: merged.group === DEFAULT_GROUP ? undefined : merged.group,
    sort: merged.sort === DEFAULT_SORT ? undefined : merged.sort,
    entry: merged.entry,
  };
}
