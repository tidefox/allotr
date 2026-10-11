import { expect, test, type Locator, type Page } from '@playwright/test';
import { t } from '../src/messages/t.ts';
import { expectAccessible } from './a11y.ts';
import { account, setupSkipped } from './account.ts';

// The Settings categories tab with made-up data. One instance per size: the
// first test creates the account and seeds it, later ones sign in through the
// API and build on what the earlier ones left, so the tests run in order.
test.describe.configure({ mode: 'serial' });

type Created = { id: string };
type Category = {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
  colour: string | null;
  icon: string | null;
  mergedIntoId: string | null;
};

async function post(page: Page, origin: string, path: string, data: object) {
  const response = await page.request.post(path, {
    data,
    headers: { origin },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as Created;
}

async function signIn(page: Page, origin: string) {
  await post(page, origin, '/v1/auth/sign-in/email', {
    email: account.email,
    password: account.password,
  });
}

async function stored(page: Page): Promise<Category[]> {
  const response = await page.request.get('/v1/categories?includeMerged=true');
  return ((await response.json()) as { categories: Category[] }).categories;
}

async function byName(page: Page, name: string): Promise<Category> {
  const found = (await stored(page)).find((c) => c.name === name);
  if (found === undefined) throw new Error(`No category ${name}`);
  return found;
}

async function tooSmall(page: Page) {
  return (
    page
      // The drag button shows only on keyboard focus.
      .locator(
        'main a, main button:not([slot=drag]), main [role=button], main [role=radio]',
      )
      .evaluateAll((els) =>
        els
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
          .map((r) => `${String(r.width)}x${String(r.height)}`),
      )
  );
}

/** A button inside the open sheet; page buttons share some of the names. */
const inSheet = (page: Page, name: string) =>
  page.getByRole('dialog').getByRole('button', { name, exact: true });
const region = (page: Page, name: string) => page.getByRole('region', { name });
// One tile holds every kind's tree.
const expenses = (page: Page) => region(page, t('settingsCategories.title'));

const seeded = new Set([
  'Dining',
  'Espresso',
  'Ramen',
  'Mortgage',
  'Property',
  'Snacks',
]);

/** The names of a tile's rows, top to bottom. */
async function order(tile: Locator): Promise<string[]> {
  const actions = tile.getByRole('button', { name: /^Actions for / });
  await actions.first().waitFor();
  const labels = await actions.evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') ?? ''),
  );
  // The starter set shares the tile; only the seeded names matter here.
  return labels
    .map((label) => label.replace(/^Actions for /, ''))
    .filter((name) => seeded.has(name));
}

/**
 * Moves focus to a control inside a row the way a keyboard user does: onto
 * the row, then Tab through its controls. (A script's own focus() on a
 * control inside a grid row lands on the row.)
 */
async function reach(page: Page, row: string, control: Locator) {
  await page.getByRole('row', { name: row, exact: true }).focus();
  for (let i = 0; i < 12; i += 1) {
    if (await control.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Could not Tab to the control in ${row}`);
}

/** Opens a row's menu and picks an item, all from the keyboard. */
async function choose(page: Page, name: string, item: string) {
  const trigger = page.getByRole('button', {
    name: t('settingsCategories.actionsOf', { name }),
  });
  await reach(page, name, trigger);
  await page.keyboard.press('Enter');
  const entry = page.getByRole('menuitem', { name: item, exact: true });
  await expect(entry).toBeVisible();
  await entry.focus();
  await page.keyboard.press('Enter');
}

test('the tree lists categories by kind with tags beside it', async ({
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
  const food = await post(page, origin, '/v1/categories', {
    name: 'Dining',
    kind: 'expense',
  });
  await post(page, origin, '/v1/categories', {
    name: 'Espresso',
    parentId: food.id,
  });
  await post(page, origin, '/v1/categories', {
    name: 'Ramen',
    parentId: food.id,
    icon: 'utensils',
    colour: 'series-2',
  });
  await post(page, origin, '/v1/categories', {
    name: 'Mortgage',
    kind: 'expense',
  });
  await post(page, origin, '/v1/categories', {
    name: 'Wages',
    kind: 'income',
    isPaycheck: true,
  });
  await post(page, origin, '/v1/tags', { name: 'Trip' });

  await page.goto('/settings/categories');
  const tile = expenses(page);
  await expect(tile.getByText('Ramen', { exact: true })).toBeVisible();
  expect(await order(tile)).toEqual([
    'Dining',
    'Espresso',
    'Ramen',
    'Mortgage',
  ]);
  await expect(
    expenses(page)
      .getByRole('row', { name: 'Wages' })
      .getByText(t('settingsCategories.paycheckTag'), { exact: true }),
  ).toBeVisible();
  await expect(
    region(page, t('settingsCategories.tags.title')).getByText('Trip', {
      exact: true,
    }),
  ).toBeVisible();
  await expectAccessible(page);
  expect(await tooSmall(page)).toEqual([]);
});

test('a parent folds and unfolds by keyboard', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/settings/categories');
  const tile = expenses(page);
  const fold = tile.getByRole('button', {
    name: t('settingsCategories.foldOf', { name: 'Dining' }),
  });
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await reach(page, 'Dining', fold);
  await page.keyboard.press('Enter');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  expect(await order(tile)).toEqual(['Dining', 'Mortgage']);
  await page.keyboard.press('Enter');
  expect(await order(tile)).toEqual([
    'Dining',
    'Espresso',
    'Ramen',
    'Mortgage',
  ]);
});

test('the arrows reorder siblings and the server keeps the order', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/settings/categories');
  const tile = expenses(page);
  await choose(page, 'Espresso', t('settingsCategories.menu.moveDown'));
  await expect
    .poll(async () => order(tile))
    .toEqual(['Dining', 'Ramen', 'Espresso', 'Mortgage']);
  await page.reload();
  expect(await order(expenses(page))).toEqual([
    'Dining',
    'Ramen',
    'Espresso',
    'Mortgage',
  ]);
});

test('a row drags with the keyboard to a new place among its siblings', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/settings/categories');
  const tile = expenses(page);
  // Mortgage moves above Dining: pick it up, move one drop target, drop.
  const row = tile.getByRole('row', { name: 'Mortgage', exact: true });
  await reach(page, 'Mortgage', row.getByRole('button', { name: /^Drag/ }));
  await page.keyboard.press('Enter');
  // Arrow up through the drop places until it is just above Dining.
  const focusedLabel = () =>
    page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  for (let i = 0; i < 20; i += 1) {
    if (/ and Dining$/.test((await focusedLabel()) ?? '')) break;
    await page.keyboard.press('ArrowUp');
  }
  expect(await focusedLabel()).toMatch(/ and Dining$/);
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => {
      const names = await order(tile);
      return names.indexOf('Mortgage') < names.indexOf('Dining');
    })
    .toBe(true);
});

test('a row drags with the mouse', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/settings/categories');
  const tile = expenses(page);
  // Mortgage is above Dining; drop it on the lower half of Dining's row.
  // Both rows must be on screen, so the list scrolls to the lower one first.
  await tile
    .getByRole('row', { name: 'Dining', exact: true })
    .scrollIntoViewIfNeeded();
  const from = await tile
    .getByRole('row', { name: 'Mortgage', exact: true })
    .boundingBox();
  const target = await tile
    .getByRole('row', { name: 'Dining', exact: true })
    .boundingBox();
  if (target === null || from === null) throw new Error('no rows');
  await page.mouse.move(from.x + 80, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 80, target.y + target.height - 3, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const names = await order(tile);
      return names.indexOf('Dining') < names.indexOf('Mortgage');
    })
    .toBe(true);
});

test('rename, icon and colour, and move under work from the row menu', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/settings/categories');

  await choose(page, 'Mortgage', t('settingsCategories.menu.rename'));
  const name = page.getByRole('textbox', {
    name: t('settingsCategories.create.name'),
  });
  await name.fill('Property');
  await page.keyboard.press('Enter');
  await expect(
    expenses(page).getByText('Property', { exact: true }),
  ).toBeVisible();

  await choose(page, 'Property', t('settingsCategories.menu.style'));
  // The input is hidden inside its swatch; people press the swatch.
  const swatch = (name: string) =>
    page.getByRole('radio', { name }).locator('xpath=ancestor::label');
  await swatch('Colour 3').click();
  await swatch('House').click();
  await expect(page.getByRole('radio', { name: 'House' })).toBeChecked();
  await expectAccessible(page);
  const small = await page
    .getByRole('dialog')
    .locator('label, button')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${String(r.width)}x${String(r.height)}`),
    );
  expect(small).toEqual([]);
  await inSheet(page, t('settingsCategories.style.save')).click();
  await expect
    .poll(async () => (await byName(page, 'Property')).icon)
    .toBe('house');
  expect((await byName(page, 'Property')).colour).toBe('series-3');

  await choose(page, 'Property', t('settingsCategories.menu.move'));
  await page
    .getByRole('dialog')
    .getByRole('button', {
      name: new RegExp(t('settingsCategories.move.under')),
    })
    .click();
  await page.getByRole('menuitemradio', { name: 'Dining' }).click();
  await inSheet(page, t('settingsCategories.move.save')).click();
  await expect
    .poll(async () => (await byName(page, 'Property')).parentId)
    .toBe((await byName(page, 'Dining')).id);
  await expect(
    expenses(page).getByRole('button', {
      name: t('settingsCategories.addSubOf', { name: 'Dining' }),
    }),
  ).toBeVisible();
});

test('a sub is added from its parent and an empty one is archived', async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/settings/categories');
  await expenses(page)
    .getByRole('button', {
      name: t('settingsCategories.addSubOf', { name: 'Dining' }),
    })
    .click();
  await page
    .getByRole('textbox', { name: t('settingsCategories.create.name') })
    .fill('Snacks');
  await page.keyboard.press('Enter');
  await expect(
    expenses(page).getByText('Snacks', { exact: true }),
  ).toBeVisible();

  await choose(page, 'Snacks', t('settingsCategories.menu.archive'));
  await inSheet(page, t('settingsCategories.archive.archive')).click();
  await expect(expenses(page).getByText('Snacks', { exact: true })).toHaveCount(
    0,
  );
  expect((await stored(page)).some((c) => c.name === 'Snacks')).toBe(false);
});

test('a category in use is merged into another when archived', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  await signIn(page, origin);
  const today = await page.request.get('/v1/today');
  const { available } = (await today.json()) as {
    available: { currency: string };
  };
  const money = (amountMinor: number) => ({
    amountMinor,
    currency: available.currency,
  });
  const wallet = await post(page, origin, '/v1/accounts', {
    name: 'Everyday',
    currency: available.currency,
    openingBalance: money(100_000),
  });
  const lunch = await byName(page, 'Ramen');
  await post(page, origin, '/v1/transactions', {
    kind: 'expense',
    accountId: wallet.id,
    amount: money(1_200),
    categoryId: lunch.id,
    note: 'Bowl',
  });

  await page.goto('/settings/categories');
  await choose(page, 'Ramen', t('settingsCategories.menu.archive'));
  await inSheet(page, t('settingsCategories.archive.archive')).click();
  await expect(
    page.getByText(t('settingsCategories.archive.inUse', { name: 'Ramen' })),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', {
      name: new RegExp(t('settingsCategories.archive.into')),
    })
    .click();
  await page.getByRole('menuitemradio', { name: /Espresso/ }).click();
  await expectAccessible(page);
  await inSheet(page, t('settingsCategories.archive.merge')).click();
  await expect(expenses(page).getByText('Ramen', { exact: true })).toHaveCount(
    0,
  );
  const merged = await byName(page, 'Ramen');
  expect(merged.mergedIntoId).toBe((await byName(page, 'Espresso')).id);
});

test('a tag is added and renamed', async ({ page, baseURL }) => {
  await signIn(page, baseURL ?? '');
  await page.goto('/settings/categories');
  const tags = region(page, t('settingsCategories.tags.title'));
  await tags
    .getByRole('button', { name: t('settingsCategories.tags.add') })
    .click();
  await page
    .getByRole('textbox', { name: t('settingsCategories.tags.name') })
    .fill('Holiday');
  await page.keyboard.press('Enter');
  await expect(tags.getByText('Holiday', { exact: true })).toBeVisible();
  await tags
    .getByRole('button', {
      name: t('settingsCategories.tags.renameOf', { name: 'Trip' }),
    })
    .click();
  await page
    .getByRole('textbox', { name: t('settingsCategories.tags.name') })
    .fill('Journey');
  await page.keyboard.press('Enter');
  await expect(tags.getByText('Journey', { exact: true })).toBeVisible();
  await expectAccessible(page);
  expect(await tooSmall(page)).toEqual([]);
});
