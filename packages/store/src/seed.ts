import { deterministicId } from '@allotr/core';
import type { Db } from './store.ts';

// What every new ledger starts with: the starter categories, the Budget and
// Savings pools and the Buffer with its first amount. This replaces the SQL
// triggers of migrations 0003, 0007, 0008, 0010 and 0022 (dropped in 0024).
//
// Every id comes from `deterministicId(ledgerId, key)` (ADR 0034), so two
// devices that seed the same ledger on their own produce the same rows.
// THE KEY SCHEME BELOW IS PERMANENT: changing a key changes the id, and the
// same seed run by an older and a newer device would then duplicate rows.
//
//   starter-category:<parent name or empty>/<name>   a starter category
//   pool:budget, pool:savings                        the two default pools
//   budget:buffer                                    the Buffer budget
//   budget-amount:budget:buffer:<effective_on>       its first amount
//   system-account:<role>:<currency>                 see store.ts
//
// Names in keys are the English starter names, never the user's renamed ones.

interface StarterCategory {
  readonly name: string;
  readonly parent: string | null;
  readonly kind: 'expense' | 'income';
  readonly isPaycheck: boolean;
  readonly incomeClass: 'earned' | 'passive' | 'refund' | 'gift';
  readonly position: number;
  readonly colour: string | null;
  readonly icon: string | null;
}

function starter(
  name: string,
  parent: string | null,
  kind: 'expense' | 'income',
  position: number,
  colour: string | null,
  icon: string | null,
  extra: Partial<Pick<StarterCategory, 'isPaycheck' | 'incomeClass'>> = {},
): StarterCategory {
  return {
    name,
    parent,
    kind,
    position,
    colour,
    icon,
    isPaycheck: extra.isPaycheck ?? false,
    incomeClass: extra.incomeClass ?? 'earned',
  };
}

/** Parents come before their children. */
export const starterCategories: readonly StarterCategory[] = [
  starter('Food', null, 'expense', 1, 'series-6', 'utensils'),
  starter('Transport', null, 'expense', 2, 'series-1', 'bus'),
  starter('Housing', null, 'expense', 3, 'series-4', 'house'),
  starter('Bills and subscriptions', null, 'expense', 4, 'series-2', 'receipt'),
  starter('Health', null, 'expense', 5, 'series-5', 'heart-pulse'),
  starter('Shopping', null, 'expense', 6, 'series-7', 'shopping-bag'),
  starter('Fun', null, 'expense', 7, 'series-3', 'ticket'),
  starter('Other', null, 'expense', 8, 'series-8', 'tag'),
  starter('Paycheck', null, 'income', 1, 'series-6', 'banknote', {
    isPaycheck: true,
  }),
  starter('Other income', null, 'income', 2, 'series-3', 'hand-coins'),
  starter('Interest', null, 'income', 3, null, null, {
    incomeClass: 'passive',
  }),
  starter('Tax refund', null, 'income', 4, null, null, {
    incomeClass: 'refund',
  }),
  starter('Gifts', null, 'income', 5, null, null, { incomeClass: 'gift' }),
  starter('Groceries', 'Food', 'expense', 1, null, 'shopping-basket'),
  starter('Eating out', 'Food', 'expense', 2, null, 'coffee'),
  starter('Rent', 'Housing', 'expense', 1, null, null),
  starter('Utilities', 'Housing', 'expense', 2, null, 'lightbulb'),
];

export interface SeedLedgerInput {
  readonly userId: string;
  readonly ledgerId: string;
  /** The user's creation instant (ISO 8601 UTC); stamps every seeded row. */
  readonly createdAt: string;
  /** The currency of the Buffer's first (zero) amount. */
  readonly defaultCurrency: string;
}

/**
 * Seeds a new ledger. Rows that already exist (same deterministic id) are
 * left alone, so running it twice, or on a device that has already seen the
 * seed, adds nothing. Run it in the transaction that creates the user.
 */
export async function seedLedger(
  db: Db,
  input: SeedLedgerInput,
): Promise<void> {
  const { userId, ledgerId, createdAt, defaultCurrency } = input;
  const id = (key: string) => deterministicId(ledgerId, key);
  const categoryId = (category: StarterCategory) =>
    id(`starter-category:${category.parent ?? ''}/${category.name}`);

  await db
    .insertInto('categories')
    .values(
      starterCategories.map((category) => ({
        id: categoryId(category),
        user_id: userId,
        name: category.name,
        kind: category.kind,
        parent_id:
          category.parent === null
            ? null
            : categoryId(
                starterCategories.find(
                  (other) =>
                    other.parent === null && other.name === category.parent,
                ) ?? category,
              ),
        is_paycheck: category.isPaycheck ? 1 : 0,
        income_class: category.incomeClass,
        position: category.position,
        colour: category.colour,
        icon: category.icon,
        created_at: createdAt,
        updated_at: createdAt,
      })),
    )
    .onConflict((conflict) => conflict.column('id').doNothing())
    .execute();

  await db
    .insertInto('pools')
    .values([
      {
        id: id('pool:budget'),
        user_id: userId,
        name: 'Budget',
        kind: 'spending',
        counts_toward_daily: 1,
        default_for: 'on',
        position: 1,
        created_at: createdAt,
        updated_at: createdAt,
      },
      {
        id: id('pool:savings'),
        user_id: userId,
        name: 'Savings',
        kind: 'savings',
        counts_toward_daily: 0,
        default_for: 'off',
        position: 2,
        created_at: createdAt,
        updated_at: createdAt,
      },
    ])
    .onConflict((conflict) => conflict.column('id').doNothing())
    .execute();

  // The Buffer starts on the UTC day of creation; the server moves it to the
  // user's local day once their time zone is set (migration 0016).
  const startedOn = createdAt.slice(0, 10);
  const bufferId = id('budget:buffer');
  await db
    .insertInto('budgets')
    .values({
      id: bufferId,
      user_id: userId,
      name: 'Buffer',
      kind: 'buffer',
      mode: 'set-aside',
      leftover: 'carry',
      started_on: startedOn,
      created_at: createdAt,
      updated_at: createdAt,
    })
    .onConflict((conflict) => conflict.column('id').doNothing())
    .execute();
  await db
    .insertInto('budget_amounts')
    .values({
      id: id(`budget-amount:budget:buffer:${startedOn}`),
      user_id: userId,
      budget_id: bufferId,
      effective_on: startedOn,
      amount_minor: 0,
      currency: defaultCurrency,
      created_at: createdAt,
    })
    .onConflict((conflict) => conflict.column('id').doNothing())
    .execute();
}
