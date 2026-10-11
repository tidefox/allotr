import { expect, test, type Page } from '@playwright/test';
import type { Money } from '@allotr/shared';
import { formatMoney } from '../src/lib/format-money.ts';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Budget · pools and bills with a little made-up data. One instance per
// size: the first test creates the account and seeds it, later ones sign in
// through the API.
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

async function smallTargets(page: Page) {
  return page
    .locator('main a, main button, main [role=button]')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
}

test('the pools sub-tab shows a tile per pool and the formula', async ({
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
  const everyday = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency: available.currency,
    openingBalance: usd(250_000),
  });
  await post(page, origin, '/v1/pools', { name: 'Travel', kind: 'spending' });
  // Borrowed money is reserved too, but it is not a bill.
  await post(page, origin, '/v1/ious', {
    direction: 'owed-by-me',
    accountId: everyday.id,
    people: [{ person: 'Alex Example', amount: usd(6_000) }],
  });
  await post(page, origin, '/v1/bills', {
    name: 'Rent',
    amount: usd(90_000),
    accountId: everyday.id,
    dueDay: 28,
  });

  await page.goto('/budget/pools');
  const budget = page.getByRole('region', { name: 'Budget', exact: true });
  await expect(budget).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Travel', exact: true }),
  ).toBeVisible();
  await expect(budget.getByText('Everyday')).toBeVisible();
  const how = page.getByRole('region', { name: t('budgetPools.how.title') });
  await expect(how).toBeVisible();
  await expect(how).toContainText(/on-budget.*bills.*free/);
  await expectAccessible(page);
  expect(await smallTargets(page)).toEqual([]);
});

test('a pool is switched in and out of the daily number by keyboard', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/budget/pools');
  // The Budget pool always counts, so its box cannot be switched off.
  await expect(
    page.getByRole('button', {
      name: t('budgetPools.dailyFixedLabel', { name: 'Budget' }),
    }),
  ).toBeDisabled();

  const travel = page.getByRole('button', {
    name: t('budgetPools.dailyLabel', { name: 'Travel' }),
  });
  await expect(travel).toHaveAttribute('aria-pressed', 'true');
  await travel.focus();
  await page.keyboard.press('Space');
  await expect(travel).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(travel).toHaveAttribute('aria-pressed', 'true');
});

test('the bills sub-tab shows the timeline and the unpaid bill', async ({
  page,
  baseURL,
}) => {
  await apiSignIn(page, baseURL ?? '');
  await page.goto('/budget/bills');
  await expect(
    page.getByRole('region', { name: t('budgetBills.timeline.title') }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', {
      name: new RegExp('^' + t('budgetBills.timeline.label')),
    }),
  ).toBeVisible();
  // Set aside is the bills only, not what is owed to people.
  const view = (await (await page.request.get('/v1/today')).json()) as {
    reserved: Money;
    reservedBills: Money;
    reservedIous: Money;
  };
  expect(view.reservedIous.amountMinor).toBe(6_000);
  const timeline = page.getByRole('region', {
    name: t('budgetBills.timeline.title'),
  });
  await expect(
    timeline
      .getByText(formatMoney(view.reservedBills, 'symbol', 'en'), {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(
    timeline.getByText(formatMoney(view.reserved, 'symbol', 'en'), {
      exact: true,
    }),
  ).toHaveCount(0);
  // Rent is due on the 28th, so it sits in this cycle or in "not due".
  await expect(page.getByText('Rent').first()).toBeVisible();
  await expect(
    page.getByRole('region', { name: t('budgetBills.paid.title') }),
  ).toBeVisible();
  await expectAccessible(page);
  expect(await smallTargets(page)).toEqual([]);
});
