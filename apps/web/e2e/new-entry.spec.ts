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

type Entry = { funding: string };

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
  // The next choice opens its own menu, so wait for this one to be gone.
  await expect(page.getByRole('menu')).toBeHidden();
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

test('an expense paid with outside money is flagged by keyboard', async ({
  page,
}) => {
  const dialog = await openForm(page, 'expense');
  await dialog
    .getByRole('textbox', { name: t('quickEntry.amountIn', { currency }) })
    .fill('39.83');
  await choose(dialog, page, t('quickEntry.category'), 'Shopping');
  const paidWith = dialog.getByRole('button', {
    name: t('quickEntry.funding.label'),
  });
  await paidWith.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('menuitemradio', { name: t('quickEntry.funding.outside') })
    .press('Enter');
  await expect(
    dialog.getByText(t('quickEntry.funding.outsideHint')),
  ).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole('button', { name: t('quickEntry.save') }).click();
  await expect(dialog).toBeHidden();
  const listed = await page.request.get('/v1/transactions');
  const entries = ((await listed.json()) as { transactions: Entry[] })
    .transactions;
  expect(entries.filter((e) => e.funding === 'outside')).toHaveLength(1);
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

test('a split with people records the bill and the shares', async ({
  page,
}) => {
  const dialog = await openForm(page, 'split');
  await expectAccessible(page);
  await dialog
    .getByRole('textbox', {
      name: t('quickEntry.amountIn', { currency }),
      exact: true,
    })
    .fill('60');
  await choose(dialog, page, t('quickEntry.category'), 'Groceries');
  // Saving without a name says what is missing.
  await dialog.getByRole('button', { name: t('quickEntry.save') }).click();
  await expect(
    dialog.getByText(t('transactionDetail.iou.errors.person')),
  ).toBeVisible();
  await dialog
    .getByRole('textbox', { name: t('transactionDetail.iou.name', { n: 1 }) })
    .fill('Sam');
  await dialog
    .getByRole('button', { name: t('transactionDetail.iou.add') })
    .click();
  await dialog
    .getByRole('textbox', { name: t('transactionDetail.iou.name', { n: 2 }) })
    .fill('Alex');
  // Even shares of 60 between three: 20 each, so people owe 40.
  await dialog.getByRole('button', { name: t('quickEntry.save') }).click();
  await expect(dialog).toBeHidden();
  // The result line shows the recorded expense: the whole bill.
  const line = resultLine(page);
  await expect(line).toContainText('60.00');
  await expect(line).toContainText('Groceries');
  const ious = await page.request.get('/v1/ious');
  const body = (await ious.json()) as {
    ious: { person: string; amount: { amountMinor: number } }[];
  };
  const owed = body.ious.filter((i) => ['Sam', 'Alex'].includes(i.person));
  expect(owed.map((i) => i.amount.amountMinor)).toEqual([2000, 2000]);
  await line.getByRole('button', { name: t('shell.command.undo') }).click();
  await expect(line).toBeHidden();
});

test('a bill is created from + new and from the Bills tab', async ({
  page,
}) => {
  await page.getByRole('button', { name: t('shell.command.new') }).click();
  await page
    .getByRole('menuitem', { name: t('shell.command.kinds.bill') })
    .click();
  const dialog = page.getByRole('dialog', { name: t('billForm.title') });
  await expect(dialog).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole('button', { name: t('billForm.save') }).click();
  await expect(dialog.getByText(t('billForm.errors.name'))).toBeVisible();
  await dialog
    .getByRole('textbox', { name: t('settings.bills.name') })
    .fill('Streaming');
  await dialog
    .getByRole('textbox', {
      name: t('settings.bills.amountIn', { currency }),
    })
    .fill('15');
  await dialog
    .getByRole('button', { name: t('settings.bills.dueDay') })
    .click();
  await page
    .getByRole('menuitemradio', {
      name: t('billForm.dueDayValue', { day: 12 }),
    })
    .click();
  await dialog.getByRole('button', { name: t('billForm.save') }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/budget/bills');
  await page
    .getByRole('button', { name: t('billForm.addLabel'), exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: t('billForm.title') }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  const bills = await page.request.get('/v1/bills');
  const list = (await bills.json()) as {
    bills: { name: string; dueDay: number }[];
  };
  expect(list.bills.find((b) => b.name === 'Streaming')?.dueDay).toBe(12);
});

test('an expense spreads one amount over categories', async ({ page }) => {
  const dialog = await openForm(page, 'expense');
  await dialog
    .getByRole('button', { name: t('quickEntry.split.start') })
    .click();
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

test('payday opens its sheet', async ({ page }) => {
  await page.getByRole('button', { name: t('shell.command.new') }).click();
  await page
    .getByRole('menuitem', { name: t('shell.command.kinds.payday') })
    .click();
  await expect(
    page.getByRole('dialog', { name: t('budgetGoalsIous.payday.title') }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
});

test('a sheet dims the page and slides out as it closes', async ({ page }) => {
  const dialog = await openForm(page, 'expense');
  const overlay = page.locator('.sheet-overlay');
  // (On a phone the menu sheet is still leaving as the form enters.)
  await expect(overlay).toHaveCount(1);
  // The dim is a filter on what is behind the sheet, not an alpha surface.
  await expect(overlay).toHaveCSS('backdrop-filter', /^brightness\(0\.\d+\)$/);
  await expectAccessible(page);

  // Esc starts the exit: both parts keep playing the same ease-in-out
  // animation until it ends, then the sheet is gone and focus is back.
  await page.keyboard.press('Escape');
  const exit = await page.evaluate(() => {
    const el = document.querySelector('.sheet-overlay');
    const panel = document.querySelector('.sheet-panel');
    const look = (target: Element | null) => {
      if (target === null) return null;
      const style = getComputedStyle(target);
      return {
        name: style.animationName,
        duration: style.animationDuration,
        easing: style.animationTimingFunction,
        playing: target.getAnimations().length,
      };
    };
    return {
      exiting: el?.hasAttribute('data-exiting') ?? false,
      overlay: look(el),
      panel: look(panel),
    };
  });
  expect(exit.exiting).toBe(true);
  expect(exit.overlay?.name).toBe('sheet-dim-out');
  expect(exit.panel?.name).toBe('sheet-out');
  expect(exit.overlay?.playing).toBeGreaterThan(0);
  expect(exit.panel?.playing).toBeGreaterThan(0);
  expect(exit.overlay?.easing).toBe('cubic-bezier(0.65, 0, 0.35, 1)');
  expect(exit.panel?.easing).toBe(exit.overlay?.easing);
  expect(exit.panel?.duration).toBe(exit.overlay?.duration);
  await expect(overlay).toHaveCount(0);
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: t('shell.command.new') }),
  ).toBeFocused();

  // Clicking the dimmed page closes it too.
  const again = await openForm(page, 'expense');
  await page.mouse.click(4, 4);
  await expect(again).toBeHidden();
});

test('reduced motion shortens the sheet motion to nothing', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--dur-sheet')
      .trim(),
  );
  expect(duration).toMatch(/^0(ms|s)$/);
  const dialog = await openForm(page, 'expense');
  // The dim stays; only the movement goes.
  await expect(page.locator('.sheet-overlay')).toHaveCSS(
    'backdrop-filter',
    /^brightness\(/,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
