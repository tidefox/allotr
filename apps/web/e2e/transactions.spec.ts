import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// (The two opening balances are entries too, so the list has five.)
// Transactions with a little made-up data: the list, its totals from the
// server, the filter menu, search and the selection in the URL. One instance
// per size: the first test creates the account and seeds it, later ones sign
// in through the API.
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

const list = (page: Page) =>
  page.getByRole('region', { name: t('transactions.list.title') }).first();

test('the list shows seeded entries with totals and passes axe', async ({
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
  const food = await post(page, origin, '/v1/categories', {
    name: 'Dining',
    kind: 'expense',
  });
  const cafes = await post(page, origin, '/v1/categories', {
    name: 'Espresso bars',
    parentId: food.id,
  });
  const fun = await post(page, origin, '/v1/categories', {
    name: 'Pastimes',
    kind: 'expense',
  });
  const salary = await post(page, origin, '/v1/categories', {
    name: 'Wages',
    kind: 'income',
  });
  const everyday = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency: available.currency,
    openingBalance: usd(250_000),
  });
  await post(page, origin, '/v1/accounts', {
    name: 'Wallet',
    currency: available.currency,
    openingBalance: usd(10_000),
  });
  for (const [categoryId, amount, note] of [
    [cafes.id, 450, 'Corner cafe'],
    [fun.id, 1_200, 'Cinema night'],
  ] as const) {
    await post(page, origin, '/v1/transactions', {
      kind: 'expense',
      accountId: everyday.id,
      amount: usd(amount),
      categoryId,
      note,
    });
  }
  await post(page, origin, '/v1/transactions', {
    kind: 'income',
    accountId: everyday.id,
    amount: usd(50_000),
    categoryId: salary.id,
    note: 'Monthly pay',
  });

  await page.goto('/transactions');
  const entries = list(page);
  await expect(entries.getByText('Corner cafe')).toBeVisible();
  await expect(entries.getByText('Cinema night')).toBeVisible();
  await expect(entries.getByText(/5 entries/)).toBeVisible();
  await expect(entries.getByText(/spent \$16\.50/)).toBeVisible();
  await expectAccessible(page);
});

test('the filter menu narrows the list and chips clear it', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/transactions');
  const entries = list(page);
  await expect(entries.getByText('Monthly pay')).toBeVisible();

  // `f` opens the filter menu (docs/ui.md §5).
  await page.keyboard.press('f');
  await page
    .getByRole('menuitemcheckbox', {
      name: t('transactions.filter.types.income'),
      exact: true,
    })
    .click();
  await expect(entries.getByText('Monthly pay')).toBeVisible();
  await expect(entries.getByText('Corner cafe')).toBeHidden();
  await expect(entries.getByText('1 entry')).toBeVisible();

  // A parent sets its children.
  await page
    .getByRole('menuitemcheckbox', {
      name: t('transactions.filter.types.expense'),
      exact: true,
    })
    .click();
  await page
    .getByRole('menuitemcheckbox', { name: 'Dining', exact: true })
    .click();
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Espresso bars' }),
  ).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(entries.getByText('Corner cafe')).toBeVisible();
  await expect(entries.getByText('Cinema night')).toBeHidden();

  const chips = page.getByRole('group', { name: t('transactions.list.chips') });
  await chips
    .getByRole('button', {
      name: t('transactions.filter.remove', { label: 'Dining' }),
    })
    .click();
  await chips
    .getByRole('button', {
      name: t('transactions.filter.remove', {
        label: t('transactions.filter.types.expense'),
      }),
    })
    .click();
  await expect(entries.getByText('Cinema night')).toBeVisible();
  await expect(chips).toBeHidden();
  await expectAccessible(page);
});

test('search finds a note, and a selected row is kept in the URL', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/transactions');
  const entries = list(page);
  await page
    .getByRole('searchbox', { name: t('transactions.list.search') })
    .fill('cinema');
  await expect(entries.getByText('Corner cafe')).toBeHidden();
  await expect(entries.getByText('Cinema night')).toBeVisible();
  await expect(page).toHaveURL(/q=cinema/);

  await entries.getByRole('button', { name: /Cinema night/ }).click();
  await expect(page).toHaveURL(/entry=/);
  await expect(
    entries.getByRole('button', { name: /Cinema night/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expectAccessible(page);

  // Back leaves the selection first, then the search.
  await page.goBack();
  await expect(page).not.toHaveURL(/entry=/);
});

test('nothing overflows sideways and targets are at least 24 px', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/transactions');
  await expect(list(page).getByText('Corner cafe')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const small = await page
    .locator('a, button, [role=button], input')
    .evaluateAll((els) =>
      els
        .filter((el) => !el.classList.contains('sr-only'))
        .map((el) => ({
          label: el.textContent || el.getAttribute('aria-label') || el.tagName,
          rect: el.getBoundingClientRect(),
        }))
        .filter(
          ({ rect }) => rect.width > 0 && (rect.width < 24 || rect.height < 24),
        )
        .map(
          ({ label, rect }) =>
            `${label}: ${String(rect.width)}x${String(rect.height)}`,
        ),
    );
  expect(small).toEqual([]);
});

test('the sort menu orders by amount as a flat list, by keyboard', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/transactions');
  const entries = list(page);
  await expect(entries.getByText('Cinema night')).toBeVisible();
  // By date the list has day headers.
  await expect(
    entries.getByRole('heading', { level: 3 }).first(),
  ).toBeVisible();

  const trigger = page.getByRole('button', {
    name: new RegExp(t('transactions.list.sort.label')),
  });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('menuitemradio', {
      name: t('transactions.list.sort.amount-asc'),
    })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sort=amount-asc/);
  // Flat: no day headers, and the smallest entry comes first.
  await expect(entries.getByRole('heading', { level: 3 })).toHaveCount(0);
  const payees = entries.locator('.truncate.font-sans');
  await expect(payees.first()).toHaveText('Corner cafe');
  // The opening balances are the largest entries.
  await expect(payees.last()).toHaveText('Opening balance');
  await expectAccessible(page);

  await page.goto('/transactions?sort=amount-desc');
  await expect(entries.locator('.truncate.font-sans').first()).not.toHaveText(
    'Corner cafe',
  );
  // An unknown value falls back to the default order with its day headers.
  await page.goto('/transactions?sort=size');
  await expect(
    entries.getByRole('heading', { level: 3 }).first(),
  ).toBeVisible();
});

test('a bill payment carries a bill tag, and a split shows under each category', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  const today = (await (await page.request.get('/v1/today')).json()) as {
    today: string;
    available: { currency: string };
  };
  const usd = (amountMinor: number) => ({
    amountMinor,
    currency: today.available.currency,
  });
  const accounts = (await (await page.request.get('/v1/accounts')).json()) as {
    accounts: { id: string; name: string }[];
  };
  const everyday = accounts.accounts.find((a) => a.name === 'Everyday');
  const cats = (await (await page.request.get('/v1/categories')).json()) as {
    categories: { id: string; name: string }[];
  };
  const id = (name: string) =>
    cats.categories.find((c) => c.name === name)?.id ?? '';
  const bill = await post(page, origin, '/v1/bills', {
    name: 'Water supply',
    amount: usd(2_000),
    accountId: everyday?.id,
    categoryId: id('Pastimes'),
    dueDay: Number(today.today.slice(8)),
  });
  await post(page, origin, `/v1/bills/${bill.id}/payments`, {
    dueOn: today.today,
    paid: usd(2_000),
  });
  await post(page, origin, '/v1/transactions', {
    kind: 'expense',
    accountId: everyday?.id,
    amount: usd(900),
    lines: [
      { categoryId: id('Pastimes'), amount: usd(500) },
      { categoryId: id('Dining'), amount: usd(400) },
    ],
    note: 'Mixed basket',
  });

  await page.goto('/transactions');
  const entries = list(page);
  const paid = entries.getByRole('row', { name: /Water supply/ });
  await expect(paid.getByText(t('transactions.list.billTag'))).toBeVisible();
  await expect(
    entries
      .getByRole('row', { name: /Corner cafe/ })
      .getByText(t('transactions.list.billTag')),
  ).toHaveCount(0);

  await page.goto('/transactions?group=category');
  for (const name of ['Pastimes', 'Dining']) {
    await expect(
      entries.getByRole('region', { name }).getByText('Mixed basket'),
    ).toBeVisible();
  }
  await expectAccessible(page);
});
