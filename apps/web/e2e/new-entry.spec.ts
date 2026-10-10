import { expect, test, type Locator, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import type { NewFormKind } from '../src/shell/command/store.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The + new forms (expense, income, transfer, split) with a little made-up
// data: each saves through the API, shows in the command line's result line
// and can be undone from there. One instance per size, so the same steps run
// at phone and desktop width.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

let currency = 'USD';
let walletId = '';

async function openForm(page: Page, kind: NewFormKind) {
  await page.getByRole('button', { name: t('shell.command.new') }).click();
  await page
    .getByRole('menuitem', { name: t(`shell.command.kinds.${kind}`) })
    .click();
  const dialog = page.getByRole('dialog', {
    name: t(`shell.command.kinds.${kind}`),
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function choose(dialog: Locator, page: Page, label: string, to: string) {
  await dialog.getByRole('button', { name: label }).first().click();
  // Categories read "Parent › Child"; a top-level one is just its name.
  await page
    .getByRole('menuitemradio', { name: new RegExp(`(^|› )${to}$`) })
    .click();
}

function resultLine(page: Page) {
  return page.locator('[data-slot=command]').getByRole('status');
}

test('seed two accounts', async ({ page, baseURL }) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/onboarding', account);
  const skip = await page.request.put('/v1/settings/setup', {
    data: setupSkipped,
    headers: { origin },
  });
  expect(skip.ok()).toBe(true);
  const today = await page.request.get('/v1/today');
  currency = ((await today.json()) as { available: { currency: string } })
    .available.currency;
  const usd = (amountMinor: number) => ({ amountMinor, currency });
  await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency,
    openingBalance: usd(250_000),
  });
  walletId = (
    await post(page, origin, '/v1/accounts', {
      name: 'Wallet',
      currency,
      openingBalance: usd(10_000),
    })
  ).id;
});

test.beforeEach(async ({ page, baseURL }) => {
  // The first test creates the account; the rest sign in through the API.
  if (walletId === '') return;
  await post(page, baseURL ?? '', '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  await page.goto('/');
});

test('an expense is logged and shown in the result line', async ({ page }) => {
  const dialog = await openForm(page, 'expense');
  await expectAccessible(page);
  await dialog
    .getByRole('textbox', { name: t('quickEntry.amountIn', { currency }) })
    .fill('12.50');
  // Saving without a category says what is missing.
  await dialog.getByRole('button', { name: t('quickEntry.save') }).click();
  await expect(
    dialog.getByText(t('quickEntry.errors.categoryRequired')),
  ).toBeVisible();
  await choose(dialog, page, t('quickEntry.category'), 'Groceries');
  await dialog.getByRole('button', { name: t('quickEntry.save') }).click();
  await expect(dialog).toBeHidden();
  const line = resultLine(page);
  await expect(line).toContainText('12.50');
  await expect(line).toContainText('Groceries');
  await expect(line).toContainText('Everyday');
  await expectAccessible(page);
});

test('income is logged by keyboard and Escape closes a form', async ({
  page,
}) => {
  await page.getByRole('button', { name: t('shell.command.new') }).focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('menuitem', { name: t('shell.command.kinds.income') })
    .press('Enter');
  const dialog = page.getByRole('dialog', {
    name: t('shell.command.kinds.income'),
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const again = await openForm(page, 'income');
  const amount = again.getByRole('textbox', {
    name: t('quickEntry.amountIn', { currency }),
  });
  await amount.fill('200');
  await again
    .getByRole('button', { name: t('quickEntry.category') })
    .first()
    .click();
  await page.getByRole('menuitemradio').first().click();
  await amount.focus();
  await page.keyboard.press('Enter');
  await expect(again).toBeHidden();
  const line = resultLine(page);
  await expect(line).toContainText('200');
});

test('a transfer moves money between two accounts, and can be undone', async ({
  page,
}) => {
  const dialog = await openForm(page, 'transfer');
  await choose(dialog, page, t('quickEntry.fromAccount'), 'Wallet');
  await choose(dialog, page, t('quickEntry.toAccount'), 'Everyday');
  await dialog
    .getByRole('textbox', { name: t('quickEntry.amountIn', { currency }) })
    .fill('30');
  await dialog.getByRole('button', { name: t('quickEntry.save') }).click();
  await expect(dialog).toBeHidden();
  const line = resultLine(page);
  await expect(line).toContainText('Wallet → Everyday');
  await line.getByRole('button', { name: t('shell.command.undo') }).click();
  await expect(line).toBeHidden();
  const entries = await page.request.get('/v1/transactions');
  const body = (await entries.json()) as {
    items?: { kind: string }[];
    transactions?: { kind: string }[];
  };
  const kinds = (body.items ?? body.transactions ?? []).map((e) => e.kind);
  expect(kinds).toContain('reversal');
});

test('a split spreads one amount over categories', async ({ page }) => {
  const dialog = await openForm(page, 'split');
  await dialog
    .getByRole('textbox', {
      name: t('quickEntry.amountIn', { currency }),
      exact: true,
    })
    .fill('30');
  await choose(
    dialog,
    page,
    t('quickEntry.split.category', { n: 1 }),
    'Groceries',
  );
  await choose(dialog, page, t('quickEntry.split.category', { n: 2 }), 'Fun');
  await dialog
    .getByRole('textbox', { name: t('quickEntry.split.amount', { n: 1 }) })
    .fill('20');
  // Five short of the amount: the form says so and does not save.
  const second = dialog.getByRole('textbox', {
    name: t('quickEntry.split.amount', { n: 2 }),
  });
  await second.fill('5');
  await dialog.getByRole('button', { name: t('quickEntry.save') }).click();
  await expect(
    dialog.getByText(t('quickEntry.errors.splitMismatch')),
  ).toBeVisible();
  await second.fill('10');
  await expectAccessible(page);
  await dialog.getByRole('button', { name: t('quickEntry.save') }).click();
  await expect(dialog).toBeHidden();
  const line = resultLine(page);
  await expect(line).toContainText('30');
  await expect(line).toContainText('Groceries');
  await expect(line).toContainText('Fun');
});

test('"transfer from here" presets the source account', async ({ page }) => {
  await page.goto(`/accounts?account=${walletId}`);
  await page
    .getByRole('button', { name: t('accountDetail.actions.transfer') })
    .first()
    .click();
  const dialog = page.getByRole('dialog', {
    name: t('shell.command.kinds.transfer'),
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: t('quickEntry.fromAccount') }).first(),
  ).toContainText('Wallet');
  await expectAccessible(page);
});

test('an IOU shows in the result line with an undo', async ({ page }) => {
  await page.getByRole('button', { name: t('shell.command.new') }).click();
  await page
    .getByRole('menuitem', { name: t('shell.command.kinds.iou') })
    .click();
  const dialog = page.getByRole('dialog', {
    name: t('budgetGoalsIous.ious.sheets.loan'),
  });
  await dialog
    .getByRole('textbox', { name: t('budgetGoalsIous.ious.form.person') })
    .fill('Sam');
  await dialog
    .getByRole('textbox', { name: t('budgetGoalsIous.ious.form.amount') })
    .fill('20');
  await dialog
    .getByRole('button', { name: t('budgetGoalsIous.ious.form.record') })
    .click();
  await expect(dialog).toBeHidden();
  const line = resultLine(page);
  await expect(line).toContainText('20');
  await line.getByRole('button', { name: t('shell.command.undo') }).click();
  await expect(line).toBeHidden();
});

test('payday opens its sheet and bill leads to the Bills tab', async ({
  page,
}) => {
  await page.getByRole('button', { name: t('shell.command.new') }).click();
  await page
    .getByRole('menuitem', { name: t('shell.command.kinds.payday') })
    .click();
  await expect(
    page.getByRole('dialog', { name: t('budgetGoalsIous.payday.title') }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: t('shell.command.new') }).click();
  await page
    .getByRole('menuitem', { name: t('shell.command.kinds.bill') })
    .click();
  await expect(page).toHaveURL(/\/budget\/bills$/);
});
