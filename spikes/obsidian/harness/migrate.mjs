// Moving a ledger in through a vault file and out again, with a made-up
// bundle (the example of architecture.md §5.1).
//   node harness/migrate.mjs [chromium|webkit|all]
import { engines, newHarnessPage, startPlugin } from './lib.mjs';

const which = process.argv[2] ?? 'chromium';
let failures = 0;
function check(engine, name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${engine}] ${name}${detail ? ` -- ${detail}` : ''}`);
}

const bundle = {
  format: 'allotr.bundle',
  version: 1,
  settings: { timeZone: 'UTC', defaultCurrency: 'EUR', paydayDay: 25 },
  categories: [{ name: 'Coffee', parent: 'Food' }],
  accounts: [{ name: 'Wallet', currency: 'EUR', openingBalance: { amountMinor: 12000, currency: 'EUR' } }],
  rates: [{ base: 'USD', quote: 'EUR', rate: '0.92', asOf: '2026-03-01' }],
  transactions: [
    {
      kind: 'expense',
      ref: 'coffee-1',
      account: 'Wallet',
      amount: { amountMinor: 350, currency: 'EUR' },
      category: 'Food/Coffee',
      occurredOn: '2026-03-02',
      tags: ['morning'],
    },
  ],
  bills: [
    {
      name: 'Phone',
      account: 'Wallet',
      amount: { amountMinor: 2500, currency: 'EUR' },
      dueDay: 22,
      payments: [{ dueOn: '2026-03-22', paidOn: '2026-03-21' }],
    },
  ],
};

/** The plugin's current ledger, exported through the in-process API. */
const exported = (page) =>
  page.evaluate(async () => {
    const runtime = await window.plugin.getRuntime();
    const r = await runtime.fetch('/v1/export?format=json', { headers: { 'x-allotr-client': 'web' } });
    return r.json();
  });

async function importVia(page, path) {
  const before = await page.evaluate(() => window.harness.state.notices.length);
  await page.evaluate(() => window.harness.runCommand('Allotr: Import Allotr export from vault'));
  await page.locator('.allotr-bundle-file', { hasText: path }).click();
  return before;
}

async function waitNotice(page, after, pattern) {
  await page.waitForFunction(
    ([n, p]) => window.harness.state.notices.slice(n).some((m) => new RegExp(p).test(m)),
    [after, pattern],
    { timeout: 30000 },
  );
  return page.evaluate((n) => window.harness.state.notices.slice(n), after);
}

async function run(engine, browser) {
  const c = (name, ok, detail) => check(engine, name, ok, detail);
  const { context, page } = await newHarnessPage(browser, { query: `?vault=migrate-${Date.now()}` });
  await startPlugin(page);
  await page.evaluate(() => window.harness.clickRibbon());
  await page.getByText('left today').first().waitFor({ timeout: 20000 });

  // 1. Empty device: imports without asking.
  await page.evaluate((text) => window.harness.addFile('exports/allotr-export.json', text), JSON.stringify(bundle));
  let n = await importVia(page, 'exports/allotr-export.json');
  let notes = await waitNotice(page, n, 'import done|refused|failed');
  c('import into an empty device', notes.some((m) => /import done/.test(m)), notes.join(' | '));
  let ledger = await exported(page);
  c('accounts imported', ledger.accounts?.length === 1 && ledger.accounts[0].name === 'Wallet', JSON.stringify(ledger.accounts));
  c('entries imported', ledger.transactions?.some((t) => t.ref === 'coffee-1' || t.amount?.amountMinor === 350), String(ledger.transactions?.length));
  c('bill imported', ledger.bills?.length === 1);
  c('view reopened', await page.locator('.allotr-host').count() === 1);

  // 2. A refused bundle changes nothing.
  const bad = { ...bundle, transactions: [{ ...bundle.transactions[0], account: 'Nowhere' }] };
  await page.evaluate((text) => window.harness.addFile('bad.json', text), JSON.stringify(bad));
  n = await importVia(page, 'bad.json');
  await page.locator('.allotr-confirm-replace').click();
  notes = await waitNotice(page, n, 'refused|import done|failed');
  c('bad bundle refused', notes.some((m) => /refused/.test(m) && /invalid_reference|account/.test(m)), notes.join(' | '));
  ledger = await exported(page);
  c('data unchanged after refusal', ledger.accounts?.length === 1 && ledger.bills?.length === 1);

  // 3. Non-empty device: asks, backs up, replaces (no duplicates).
  n = await importVia(page, 'exports/allotr-export.json');
  await page.locator('.allotr-confirm-replace').click();
  notes = await waitNotice(page, n, 'import done|refused|failed');
  const backups = await page.evaluate(() => window.harness.app.vault.getFiles().map((f) => f.path).filter((p) => p.startsWith('Allotr backup')));
  c('backup written before replacing', backups.length >= 1, backups.join(', '));
  ledger = await exported(page);
  c('replaced, not merged', ledger.accounts?.length === 1 && ledger.bills?.length === 1, `${ledger.accounts?.length} accounts`);
  const backup = JSON.parse(await page.evaluate((p) => window.harness.readFile(p), backups[0]));
  c('backup is a bundle of the old data', backup.format === 'allotr.bundle' && backup.accounts.length === 1);

  // 4. Export command, and the round trip.
  await page.evaluate(() => window.harness.runCommand('Allotr: Export Allotr data to vault'));
  await page.waitForFunction(() => window.harness.app.vault.getFiles().some((f) => f.path.startsWith('Allotr export')));
  const exportPath = await page.evaluate(() => window.harness.app.vault.getFiles().find((f) => f.path.startsWith('Allotr export')).path);
  const out = JSON.parse(await page.evaluate((p) => window.harness.readFile(p), exportPath));
  c('export command writes the bundle', JSON.stringify(out) === JSON.stringify(ledger));

  // 5. Saved: survives a reload.
  await page.evaluate(() => window.plugin.getRuntime().then((r) => r.flush()));
  await page.reload();
  await startPlugin(page);
  ledger = await exported(page);
  c('imported data persists across reload', ledger.accounts?.length === 1 && ledger.accounts[0].name === 'Wallet');

  const errors = page.logs.filter((l) => l.startsWith('pageerror'));
  c('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

for (const [name, engine] of Object.entries(engines)) {
  if (which !== 'all' && which !== name) continue;
  const browser = await engine.launch();
  try {
    await run(name, browser);
  } catch (error) {
    check(name, 'scenario', false, String(error));
  } finally {
    await browser.close();
  }
}
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
