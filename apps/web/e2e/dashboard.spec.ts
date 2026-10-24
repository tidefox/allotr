import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The Dashboard with a little made-up data, so its tiles show rows, bars and
// charts rather than empty states. One instance per size: the first test
// creates the account and seeds it, later ones sign in through the API.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

async function apiSignIn(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
}

// "Needs attention" is left out: it only shows while there is something to
// attend to (its own tests below).
const titles = [
  'thisCycle',
  'todaysEntries',
  'allocation',
  'budgets',
  'nextDays',
  'pools',
  'emergencyFund',
  'netWorth',
] as const;

test('the dashboard shows every tile with seeded data', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/onboarding', account);
  const skip = await page.request.put('/v1/settings/setup', {
    data: setupSkipped,
    headers: { origin },
  });
  expect(skip.ok()).toBe(true);

  const today = await page.request.get('/v1/today');
  const { available } = (await today.json()) as {
    available: { currency: string };
  };
  const usd = (amountMinor: number) => ({
    amountMinor,
    currency: available.currency,
  });
  const groceries = await post(page, origin, '/v1/categories', {
    name: 'Groceries',
    kind: 'expense',
    icon: 'beer',
  });
  const everyday = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency: available.currency,
    openingBalance: usd(250_000),
  });
  await post(page, origin, '/v1/transactions', {
    kind: 'expense',
    accountId: everyday.id,
    amount: usd(4_200),
    categoryId: groceries.id,
    note: 'Corner market',
  });
  await post(page, origin, '/v1/budgets', {
    name: 'Groceries',
    target: { kind: 'category', categoryId: groceries.id },
    amount: usd(40_000),
  });
  const household = await post(page, origin, '/v1/categories', {
    name: 'Household',
    kind: 'expense',
  });
  const repairs = await post(page, origin, '/v1/categories', {
    name: 'Repairs',
    kind: 'expense',
    parentId: household.id,
  });
  await post(page, origin, '/v1/budgets', {
    name: 'Repairs',
    target: { kind: 'category', categoryId: repairs.id },
    amount: usd(10_000),
  });

  await page.goto('/');
  for (const key of titles) {
    await expect(
      page.getByRole('region', { name: t(`dashboardTiles.${key}.title`) }),
    ).toBeVisible();
  }
  const entries = page.getByRole('region', {
    name: t('dashboardTiles.todaysEntries.title'),
  });
  await expect(entries.getByText('Corner market')).toBeVisible();
  const budgets = page.getByRole('region', {
    name: t('dashboardTiles.budgets.title'),
  });
  await expect(budgets.getByText('Groceries')).toBeVisible();
  // A parent row stands over its subcategory, with the server's total.
  await expect(budgets.getByText('Household', { exact: true })).toBeVisible();
  await expect(budgets.getByText('Repairs', { exact: true })).toBeVisible();
  const allocation = page.getByRole('region', {
    name: t('dashboardTiles.allocation.title'),
  });
  // Nothing here is unexplained, so the `other` part of zero is left out
  // and the other five each print the server's share.
  await expect(
    allocation.getByText(t('dashboardTiles.allocation.other'), {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(allocation.getByText(/^(\d+|<1)%$/)).toHaveCount(5);
  // The subtitle splits the start into the server's paycheck and carried.
  await expect(allocation.getByText(/paycheck .+ \+ carried .+/)).toBeVisible();
  const cycle = page.getByRole('region', {
    name: t('dashboardTiles.thisCycle.title'),
  });
  // The pace stat carries the server's difference as an amount.
  await expect(
    cycle.getByText(
      new RegExp(
        `^(${t('dashboardTiles.thisCycle.underPace')}|${t('dashboardTiles.thisCycle.onPace')}|${t('dashboardTiles.thisCycle.overPace')})$`,
      ),
    ),
  ).toBeVisible();
  const fund = page.getByRole('region', {
    name: t('dashboardTiles.emergencyFund.title'),
  });
  await expect(
    fund.getByText(t('dashboardTiles.emergencyFund.thisCycle')),
  ).toBeVisible();
  await expect(
    fund.getByText(t('dashboardTiles.emergencyFund.atThisRate')),
  ).toBeVisible();
  const worth = page.getByRole('region', {
    name: t('dashboardTiles.netWorth.title'),
  });
  // The cycle opened today, so the chart shows the shortest window.
  await expect(
    worth.getByText(t('dashboardTiles.netWorth.subtitleDays', { days: 7 })),
  ).toBeVisible();

  // Tiles run in the order the user acts on them: the daily number, what
  // was logged today, budgets and the week ahead, then the allocation.
  const order = await page
    .getByRole('region', { name: t('shell.content') })
    .getByRole('heading', { level: 2 })
    .allInnerTexts();
  const place = (key: (typeof titles)[number]) =>
    order.indexOf(t(`dashboardTiles.${key}.title`));
  const placed = [
    'thisCycle',
    'todaysEntries',
    'budgets',
    'nextDays',
    'allocation',
    'pools',
  ].map((key) => place(key as (typeof titles)[number]));
  expect(placed.every((index) => index >= 0)).toBe(true);
  expect(placed).toEqual([...placed].sort((a, b) => a - b));
  await expectAccessible(page);
});

test('budget parents fold and the payday plan opens, by keyboard', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/');
  const budgets = page.getByRole('region', {
    name: t('dashboardTiles.budgets.title'),
  });
  const fold = budgets.getByRole('button', {
    name: t('dashboardTiles.budgets.collapse', { name: 'Household' }),
  });
  await fold.focus();
  await page.keyboard.press('Enter');
  const unfold = budgets.getByRole('button', {
    name: t('dashboardTiles.budgets.expand', { name: 'Household' }),
  });
  await expect(unfold).toHaveAttribute('aria-expanded', 'false');
  await expect(budgets.getByText('Repairs', { exact: true })).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(budgets.getByText('Repairs', { exact: true })).toBeVisible();

  const plan = page
    .getByRole('region', { name: t('dashboardTiles.allocation.title') })
    .getByRole('button', { name: t('dashboardTiles.allocation.planPayday') });
  await plan.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', {
    name: t('budgetGoalsIous.payday.title'),
  });
  await expect(sheet).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(plan).toBeFocused();
});

test('a pool is switched in and out of the daily number by keyboard', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  await post(page, origin, '/v1/pools', { name: 'Travel', kind: 'spending' });
  await page.goto('/');
  const pools = page.getByRole('region', {
    name: t('dashboardTiles.pools.title'),
  });
  // The Budget pool always counts, so its box cannot be switched off.
  await expect(
    pools.getByRole('button', {
      name: t('dashboardTiles.pools.countsFixed', { name: 'Budget' }),
    }),
  ).toBeDisabled();

  const travel = pools.getByRole('button', {
    name: t('dashboardTiles.pools.counts', { name: 'Travel' }),
  });
  await expect(travel).toHaveAttribute('aria-pressed', 'true');
  await travel.focus();
  await page.keyboard.press('Space');
  await expect(travel).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(travel).toHaveAttribute('aria-pressed', 'true');
  await expectAccessible(page);
});

async function waitForReminder(page: Page) {
  // The scheduler records the weekly review within a second or two.
  await expect
    .poll(async () => {
      const response = await page.request.get('/v1/reminders');
      return ((await response.json()) as { unread: number }).unread;
    })
    .toBeGreaterThan(0);
}

test('needs attention folds by keyboard and the choice is kept', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await waitForReminder(page);

  await page.goto('/');
  const tile = page.getByRole('region', {
    name: t('dashboardTiles.needsAttention.title'),
  });
  const toggle = tile.getByRole('button', {
    name: t('dashboardTiles.needsAttention.toggle'),
  });
  const markAll = tile.getByRole('button', {
    name: t('dashboardTiles.needsAttention.markAllRead'),
  });
  // Folded under 600 px of frame, open from there, until a choice is made.
  const phone = (page.viewportSize()?.width ?? 0) < 600;
  await expect(toggle).toHaveAttribute('aria-expanded', String(!phone));
  await expect(markAll).toBeVisible({ visible: !phone });
  await expectAccessible(page);

  // Folded, only the title bar stays: the count, the tag and the item.
  await toggle.focus();
  if (!phone) await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(markAll).toBeHidden();
  await expect(
    tile.getByText(new RegExp(t('dashboardTiles.needsAttention.tagReview'))),
  ).toBeVisible();
  await expectAccessible(page);

  // Open again, then the choice survives a reload.
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(markAll).toBeVisible();
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(markAll).toBeVisible();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('every unread reminder is marked read at once, by keyboard', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await waitForReminder(page);

  await page.goto('/');
  const tile = page.getByRole('region', {
    name: t('dashboardTiles.needsAttention.title'),
  });
  const toggle = tile.getByRole('button', {
    name: t('dashboardTiles.needsAttention.toggle'),
  });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
  const markAll = tile.getByRole('button', {
    name: t('dashboardTiles.needsAttention.markAllRead'),
  });
  await expect(markAll).toBeVisible();
  await expectAccessible(page);

  await markAll.focus();
  await page.keyboard.press('Enter');
  await expect(markAll).toBeHidden();
  const after = await page.request.get('/v1/reminders');
  expect(((await after.json()) as { unread: number }).unread).toBe(0);
  // With nothing left to attend to the tile is gone, not an empty state.
  await expect(tile).toHaveCount(0);
  await expectAccessible(page);
});

// An IOU lent is a transfer with one own side. Today's entries drew it as a
// move with no amount, where the ledger shows money out; both must agree.
test('an IOU lent shows its direction and amount in today’s entries', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  const accounts = (await (await page.request.get('/v1/accounts')).json()) as {
    accounts: { id: string; name: string; balance: { currency: string } }[];
  };
  const everyday = accounts.accounts.find((a) => a.name === 'Everyday');
  await post(page, origin, '/v1/ious', {
    direction: 'owed-to-me',
    accountId: everyday?.id,
    people: [
      {
        person: 'Alex',
        amount: { amountMinor: 5_000, currency: everyday?.balance.currency },
      },
    ],
  });

  await page.goto('/');
  const entries = page.getByRole('region', {
    name: t('dashboardTiles.todaysEntries.title'),
  });
  await expect(entries.getByText(/\$50\.00/)).toBeVisible();
  // Money went out of an account: no "moved between accounts" arrow.
  await expect(entries).not.toContainText('↔');
  await expectAccessible(page);
});
