import { expect, test, type Locator, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// Withdrawal links (ADR 0038) on the entry detail, with made-up data: a
// 300.00 transfer from savings and a 340.00 purchase on the same day.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

async function spentToday(page: Page) {
  const response = await page.request.get('/v1/today');
  const body = (await response.json()) as {
    spentToday: { amountMinor: number };
  };
  return body.spentToday.amountMinor;
}

let expenseId = '';
let transferId = '';

const detailOf = (page: Page) =>
  page.getByRole('region', { name: t('transactionDetail.title') }).last();

async function expectTargets(scope: Locator) {
  const small = await scope
    .locator('a, button, [role=button], input')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
  expect(small).toEqual([]);
}

test('a purchase can be linked to a savings withdrawal and unlinked', async ({
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
  const currency = ((await today.json()) as { available: { currency: string } })
    .available.currency;
  const amount = (amountMinor: number) => ({ amountMinor, currency });

  const everyday = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency,
    openingBalance: amount(250_000),
  });
  const nest = await post(page, origin, '/v1/accounts', {
    name: 'Nest egg',
    currency,
    budgetGroup: 'off',
    openingBalance: amount(900_000),
  });
  const category = await post(page, origin, '/v1/categories', {
    name: 'Appliances',
    kind: 'expense',
  });
  transferId = (
    await post(page, origin, '/v1/transactions', {
      kind: 'transfer',
      fromAccountId: nest.id,
      toAccountId: everyday.id,
      sent: amount(30_000),
      note: 'Move for fridge',
    })
  ).id;
  expenseId = (
    await post(page, origin, '/v1/transactions', {
      kind: 'expense',
      accountId: everyday.id,
      amount: amount(34_000),
      categoryId: category.id,
      note: 'Fridge',
    })
  ).id;
  expect(await spentToday(page)).toBe(34_000);

  await page.goto(`/transactions?entry=${expenseId}`);
  const detail = detailOf(page);
  const section = detail.getByRole('region', {
    name: t('withdrawalLinks.expense.title'),
  });
  await expect(section).toBeVisible();
  await expectAccessible(page);
  await expectTargets(detail);

  await section
    .getByRole('button', { name: t('withdrawalLinks.expense.action') })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('withdrawalLinks.expense.sheetTitle'),
  });
  await expect(sheet).toBeVisible();
  // Nothing is chosen until a withdrawal is picked; then the most that fits
  // fills the amount.
  const amountField = sheet.getByRole('textbox', {
    name: t('withdrawalLinks.expense.amount'),
  });
  await expect(amountField).toHaveValue('');
  await sheet.getByRole('button', { name: /Nest egg → Everyday/ }).click();
  await expect(amountField).toHaveValue('300.00');
  await expectAccessible(page);
  await expectTargets(sheet);
  await sheet.getByRole('button', { name: t('withdrawalLinks.save') }).click();
  await expect(sheet).toBeHidden();

  // The link shows on the purchase, the budget figure moves by what the user
  // paid themselves, and the list tags the entry.
  await expect(section).toContainText('300.00');
  await expect(section).toContainText('Nest egg');
  await expect.poll(() => spentToday(page)).toBe(4000);
  await expect(
    page.getByText(t('withdrawalLinks.tag.expense'), { exact: true }).first(),
  ).toBeVisible();
  await expectAccessible(page);

  // The withdrawal shows the mirror section.
  await section
    .getByRole('button', {
      name: new RegExp(`^${t('withdrawalLinks.open')} `),
    })
    .click();
  const mirror = detailOf(page).getByRole('region', {
    name: t('withdrawalLinks.withdrawal.title'),
  });
  await expect(mirror).toContainText('Fridge');
  await expect(mirror).toContainText('300.00');
  await expect(page).toHaveURL(new RegExp(transferId));

  // Removing the link takes the figure back.
  await page.goto(`/transactions?entry=${expenseId}`);
  await section.getByRole('button', { name: /^Remove the link with / }).click();
  await expectAccessible(page);
  await section
    .getByRole('button', { name: t('withdrawalLinks.confirmYes') })
    .click();
  await expect(section.getByText('300.00')).toBeHidden();
  await expect.poll(() => spentToday(page)).toBe(34_000);
  await expect(
    section.getByRole('button', { name: t('withdrawalLinks.expense.action') }),
  ).toBeVisible();
});
