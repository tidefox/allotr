import { expect, test, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The entry detail on /transactions?entry=ID, with made-up data. The list
// owns the selection, so these specs open an entry by its address; they
// need the Transactions screen's list and layout to mount the detail.
test.describe.configure({ mode: 'serial' });

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as { id: string };
}

let entryId = '';
let currency = 'USD';
let accountId = '';
let categoryId = '';

async function freshEntry(page: Page, origin: string, note: string) {
  return (
    await post(page, origin, '/v1/transactions', {
      kind: 'expense',
      accountId,
      amount: { amountMinor: 700, currency },
      categoryId,
      note,
    })
  ).id;
}

test('an entry shows its category, account, budget and same-payee entries', async ({
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
  currency = ((await today.json()) as { available: { currency: string } })
    .available.currency;
  const usd = (amountMinor: number) => ({ amountMinor, currency });

  const food = await post(page, origin, '/v1/categories', {
    name: 'Treats',
    kind: 'expense',
    icon: 'beer',
  });
  const cafe = await post(page, origin, '/v1/categories', {
    name: 'Pastry shop',
    kind: 'expense',
    parentId: food.id,
  });
  const everyday = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency,
    openingBalance: usd(250_000),
  });
  accountId = everyday.id;
  categoryId = cafe.id;
  const entry = (amountMinor: number) =>
    post(page, origin, '/v1/transactions', {
      kind: 'expense',
      accountId: everyday.id,
      amount: usd(amountMinor),
      categoryId: cafe.id,
      note: 'Corner cafe',
    });
  await entry(380);
  entryId = (await entry(450)).id;
  await post(page, origin, '/v1/budgets', {
    name: 'Cafe budget',
    target: { kind: 'category', categoryId: cafe.id },
    amount: usd(500),
  });

  await page.goto(`/transactions?entry=${entryId}`);
  const detail = page
    .getByRole('region', {
      name: t('transactionDetail.title'),
    })
    .last();
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole('heading', { name: 'Corner cafe' }),
  ).toBeVisible();
  await expect(detail.getByText('Treats › Pastry shop')).toBeVisible();
  await expect(detail.getByText('Everyday')).toBeVisible();
  await expect(
    page.getByRole('region', { name: t('transactionDetail.budget.title') }),
  ).toContainText('Cafe budget');
  const samePayee = page.getByRole('region', {
    name: t('transactionDetail.payee.title'),
  });
  await expect(samePayee.getByRole('button')).toHaveCount(1);
  await expectAccessible(page);

  const small = await detail
    .locator('a, button, [role=button], input')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
  expect(small).toEqual([]);
});

test('editing an entry opens the replacement and keeps the old version', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  await page.goto(`/transactions?entry=${entryId}`);
  const detail = page
    .getByRole('region', {
      name: t('transactionDetail.title'),
    })
    .last();
  await detail
    .getByRole('button', { name: t('transactionDetail.actions.edit') })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('transactionDetail.edit.title'),
  });
  await expect(sheet).toBeVisible();
  await expectAccessible(page);
  await sheet
    .getByRole('textbox', { name: t('quickEntry.amountIn', { currency }) })
    .fill('5.25');
  await sheet
    .getByRole('button', { name: t('quickEntry.saveChanges') })
    .click();
  await expect(sheet).toBeHidden();
  await expect(
    detail.getByText(t('transactionDetail.tags.edited')),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: t('transactionDetail.history.title') }),
  ).toContainText(t('transactionDetail.history.version', { n: 1 }));
  await expectAccessible(page);
});

test('a deleted entry can be restored', async ({ page, baseURL }) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  const id = await freshEntry(page, origin, 'Bakery');
  await page.goto(`/transactions?entry=${id}`);
  const detail = page
    .getByRole('region', {
      name: t('transactionDetail.title'),
    })
    .last();
  await detail
    .getByRole('button', { name: t('transactionDetail.actions.delete') })
    .click();
  await expect(
    detail.getByText(t('transactionDetail.tags.deleted'), { exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole('button', { name: t('transactionDetail.actions.edit') }),
  ).toBeHidden();
  await expectAccessible(page);
  await detail
    .getByRole('button', { name: t('transactionDetail.actions.restore') })
    .click();
  await expect(
    detail.getByText(t('transactionDetail.tags.deleted'), { exact: true }),
  ).toBeHidden();
});

test('the cover sheet opens', async ({ page, baseURL }) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  const id = await freshEntry(page, origin, 'Kiosk');
  await page.goto(`/transactions?entry=${id}`);
  const detail = page
    .getByRole('region', {
      name: t('transactionDetail.title'),
    })
    .last();
  await detail
    .getByRole('button', { name: t('transactionDetail.actions.cover') })
    .click();
  await expect(
    page.getByRole('dialog', { name: t('transactionDetail.coverSheet.title') }),
  ).toBeVisible();
  await expectAccessible(page);
});

/** The notes of the entries matching `q`, as the API lists them. */
async function listedNotes(page: Page, q: string) {
  const response = await page.request.get(
    `/v1/transactions?q=${encodeURIComponent(q)}`,
  );
  const body = (await response.json()) as {
    transactions: { note: string | null }[];
  };
  return body.transactions.map((e) => e.note);
}

test('an entry moves up and down within its day by keyboard', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  await freshEntry(page, origin, 'Queue one');
  const two = await freshEntry(page, origin, 'Queue two');
  await freshEntry(page, origin, 'Queue three');
  expect(await listedNotes(page, 'Queue')).toEqual([
    'Queue three',
    'Queue two',
    'Queue one',
  ]);

  await page.goto(`/transactions?q=Queue&entry=${two}`);
  const detail = page
    .getByRole('region', { name: t('transactionDetail.title') })
    .last();
  const up = detail.getByRole('button', {
    name: t('transactionDetail.order.up'),
  });
  const down = detail.getByRole('button', {
    name: t('transactionDetail.order.down'),
  });
  await expect(up).toBeEnabled();
  await expectAccessible(page);

  await up.focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => listedNotes(page, 'Queue'))
    .toEqual(['Queue two', 'Queue three', 'Queue one']);
  // At the top of the day there is nowhere further up. (Both buttons are
  // disabled while the move saves, so wait for the one that is enabled.)
  await expect(down).toBeEnabled();
  await expect(up).toBeDisabled();

  await down.press('Enter');
  await expect
    .poll(() => listedNotes(page, 'Queue'))
    .toEqual(['Queue three', 'Queue two', 'Queue one']);
});

test('dragging a row changes its place in the day', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  await page.goto('/transactions?q=Queue');
  const rows = page
    .getByRole('region', { name: t('transactions.list.title') })
    .first()
    .getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('Queue three');
  await rows.nth(2).dragTo(rows.nth(0), { targetPosition: { x: 60, y: 4 } });
  await expect
    .poll(() => listedNotes(page, 'Queue'))
    .toEqual(['Queue one', 'Queue three', 'Queue two']);
  await expect(rows.first()).toContainText('Queue one');
  await expectAccessible(page);
});

test('an entry is split with people and replaced by the split', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
  const id = await freshEntry(page, origin, 'Shared pizza');
  await page.goto(`/transactions?entry=${id}`);
  const detail = page
    .getByRole('region', { name: t('transactionDetail.title') })
    .last();
  await detail
    .getByRole('button', { name: t('transactionDetail.actions.iou') })
    .click();
  const sheet = page.getByRole('dialog', {
    name: t('transactionDetail.iou.title'),
  });
  await expect(sheet).toBeVisible();
  await expectAccessible(page);

  // A person with no name is refused before anything is sent.
  await sheet
    .getByRole('button', { name: t('transactionDetail.iou.save') })
    .click();
  await expect(
    sheet.getByText(t('transactionDetail.iou.errors.person')),
  ).toBeVisible();

  await sheet
    .getByRole('textbox', { name: t('transactionDetail.iou.name', { n: 1 }) })
    .fill('Sam');
  await sheet
    .getByRole('button', { name: t('transactionDetail.iou.add') })
    .click();
  await sheet
    .getByRole('textbox', { name: t('transactionDetail.iou.name', { n: 2 }) })
    .fill('Alex');
  await sheet
    .getByRole('button', { name: t('transactionDetail.iou.save') })
    .click();
  await expect(sheet).toBeHidden();

  const ious = await page.request.get('/v1/ious');
  const people = ((await ious.json()) as { ious: { person: string }[] }).ious
    .map((i) => i.person)
    .sort();
  expect(people).toEqual(['Alex', 'Sam']);
});
