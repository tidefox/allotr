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

  // From 1000 px the first entry is open already (the address was replaced).
  const before = page.url();
  await entries
    .getByRole('button', { name: /^(?!Drag).*Cinema night/ })
    .click();
  await expect(page).toHaveURL(/entry=/);
  await expect(
    entries.getByRole('button', { name: /^(?!Drag).*Cinema night/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page).not.toHaveURL(before);
  await expectAccessible(page);

  // Back leaves the selection first, then the search.
  await page.goBack();
  await expect(page).toHaveURL(before);
});

test('moving within a day is off while a filter hides entries', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  const up = t('transactionDetail.order.up');
  const down = t('transactionDetail.order.down');
  const open = async (url: string) => {
    await page.goto(url);
    await list(page).getByText('Cinema night').click();
  };

  // Unfiltered: the day can be reordered, no hint.
  await open('/transactions');
  await expect(page.getByRole('button', { name: down }).first()).toBeVisible();
  await expect(page.locator('[data-order-blocked]')).toBeHidden();

  // A type filter leaves Monthly pay out of the day: both buttons are off.
  await open('/transactions?type=expense');
  await expect(page.getByRole('button', { name: up }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: down }).first()).toBeDisabled();
  await expect(
    page.getByText(t('transactionDetail.order.blocked')),
  ).toBeVisible();
  await expectAccessible(page);
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
  const payees = entries.locator('.truncate.font-sans [data-name]');
  await expect(payees.first()).toHaveText('Corner cafe');
  // The opening balances are the largest entries.
  await expect(payees.last()).toHaveText('Opening balance');
  await expectAccessible(page);

  await page.goto('/transactions?sort=amount-desc');
  await expect(
    entries.locator('.truncate.font-sans [data-name]').first(),
  ).not.toHaveText('Corner cafe');
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

// From 1000 px the list and its detail share the content height: the first
// entry is open, and only the list body scrolls. Below it nothing selects.
test('the first entry opens, and the list scrolls and loads alone', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await apiSignIn(page, origin);
  const wide = (page.viewportSize()?.width ?? 0) >= 1000;
  const accounts = (await (await page.request.get('/v1/accounts')).json()) as {
    accounts: { id: string; name: string }[];
  };
  const everyday = accounts.accounts.find((a) => a.name === 'Everyday');
  const today = (await (await page.request.get('/v1/today')).json()) as {
    available: { currency: string };
  };
  const category = await post(page, origin, '/v1/categories', {
    name: 'Bulk buys',
    kind: 'expense',
  });
  // More than one page of 50, so the end of the list loads another.
  for (let n = 1; n <= 60; n += 1) {
    await post(page, origin, '/v1/transactions', {
      kind: 'expense',
      accountId: everyday?.id,
      amount: { amountMinor: 100 + n, currency: today.available.currency },
      categoryId: category.id,
      note: `Bulk ${String(n)}`,
    });
  }

  // Arrive by a link inside the app, so Back can show whether the first
  // entry replaced the address or added one.
  if (wide) {
    await page.goto('/accounts');
    await page
      .getByRole('link', { name: t('nav.transactions') })
      .first()
      .click();
  } else {
    await page.goto('/transactions');
  }
  const scroller = page.getByRole('region', {
    name: t('transactions.list.scroll'),
  });
  if (!wide) {
    // Below 1000 px a selection opens a sheet, so nothing is selected.
    await expect(list(page)).toBeVisible();
    await expect(page).not.toHaveURL(/entry=/);
    await expect(scroller).toHaveCount(0);
    return;
  }
  await expect(page).toHaveURL(/entry=/);
  const detail = page.getByRole('region', {
    name: t('transactionDetail.title'),
    exact: true,
  });
  await expect(detail).toBeVisible();
  const content = page.getByRole('region', { name: t('shell.content') });
  const overflow = (region: typeof content) =>
    region.evaluate((el) => el.scrollHeight - el.clientHeight);
  // The page has nothing to scroll; the list does.
  expect(await overflow(content)).toBeLessThanOrEqual(0);
  await expect(scroller).toBeVisible();
  expect(await overflow(scroller)).toBeGreaterThan(0);

  const listTitle = list(page).getByRole('heading', {
    name: t('transactions.list.title'),
  });
  const titleBefore = await listTitle.boundingBox();
  const detailBefore = await detail.boundingBox();
  const rows = scroller.getByText(/^Bulk \d+$/);
  const loaded = await rows.count();

  // A day header stays at the top of the list while its rows scroll past.
  await scroller.evaluate((el) => {
    el.scrollTop = 600;
  });
  const top = (await scroller.boundingBox())?.y ?? 0;
  const stuck = await scroller
    .getByRole('heading', { level: 3 })
    .evaluateAll(
      (els, edge) =>
        els.filter((el) => Math.abs(el.getBoundingClientRect().y - edge) < 2)
          .length,
      top,
    );
  expect(stuck).toBe(1);

  // Keyboard: focus the list region and page down to the end.
  await scroller.focus();
  await page.keyboard.press('End');
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  // The end of the list loads the next page.
  await expect.poll(() => rows.count()).toBeGreaterThan(loaded);
  expect(await rows.count()).toBeLessThanOrEqual(60);
  // The page, the list title and the detail did not move.
  expect(await overflow(content)).toBeLessThanOrEqual(0);
  expect(await listTitle.boundingBox()).toEqual(titleBefore);
  expect(await detail.boundingBox()).toEqual(detailBefore);
  await expectAccessible(page);

  // Back skips the replaced address and returns to the screen before it.
  await page.goBack();
  await expect(page).toHaveURL(/\/accounts/);

  // An entry far down the list opens scrolled into view.
  const first = (await (
    await page.request.get('/v1/transactions?limit=50&undone=hide')
  ).json()) as { transactions: { id: string }[] };
  const far = first.transactions[40];
  await page.goto(`/transactions?entry=${far?.id ?? ''}`);
  const open = scroller.locator('[data-selected]').first();
  await expect(open).toBeInViewport();
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});
