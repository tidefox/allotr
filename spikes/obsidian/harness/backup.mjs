// Per-device vault snapshots, restore on start, pruning, atomic writes and the scheduler, with made-up data.
//   node harness/backup.mjs [chromium|webkit|all]
import { createHash } from 'node:crypto';
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
  rates: [],
  transactions: [
    { kind: 'expense', ref: 'coffee-1', account: 'Wallet', amount: { amountMinor: 350, currency: 'EUR' }, category: 'Food/Coffee', occurredOn: '2026-03-02', tags: [] },
  ],
  bills: [],
};

const LEGACY = 'Allotr/allotr-latest.json';
const deviceId = (page) => page.evaluate(() => window.harness.app.loadLocalStorage('allotr-spike-vault-id'));
const latestOf = (id) => `Allotr/devices/${id}/latest.json`;
const today = (id) => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `Allotr/devices/${id}/backups/allotr-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
};
const read = (page, path) => page.evaluate((p) => window.harness.readFile(p), path);
const files = (page, prefix) =>
  page.evaluate((p) => window.harness.app.vault.getFiles().map((f) => f.path).filter((x) => x.startsWith(p)), prefix);
const exported = (page) =>
  page.evaluate(async () => {
    const runtime = await window.plugin.getRuntime();
    return (await runtime.fetch('/v1/export?format=json', { headers: { 'x-allotr-client': 'web' } })).json();
  });
const post = (page, path, body) =>
  page.evaluate(
    async ([p, b]) => {
      const runtime = await window.plugin.getRuntime();
      const r = await runtime.fetch(p, { method: 'POST', headers: { 'x-allotr-client': 'web', 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(b) });
      return { status: r.status, text: await r.text() };
    },
    [path, body],
  );
const waitWritten = (page, path, since) =>
  page.waitForFunction(([p, n]) => window.harness.writes.slice(n).includes(p), [path, since], { timeout: 40000 });
const writesCount = (page) => page.evaluate(() => window.harness.writes.length);

/**
 * Stops the plugin and deletes the database. By default the device id is forgotten too
 * (a new device on the same vault); `keepId` keeps it (the browser evicted the database).
 */
async function clearDevice(page, { keepId = false } = {}) {
  await page.evaluate(async (keepId) => {
    await window.harness.unloadPlugin(window.plugin);
    await new Promise((r) => setTimeout(r, 500));
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('allotr-spike');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
    if (!keepId) window.harness.app.saveLocalStorage('allotr-spike-vault-id', null);
  }, keepId);
}

async function run(engine, browser) {
  const c = (name, ok, detail) => check(engine, name, ok, detail);
  const { context, page } = await newHarnessPage(browser, { query: `?vault=backup-${Date.now()}` });
  await startPlugin(page);
  await page.evaluate(() => window.plugin.getRuntime());
  const id = await deviceId(page);
  const LATEST = latestOf(id);

  // 1. A write produces the latest file and today's dated copy.
  let w = await writesCount(page);
  let r = await post(page, '/v1/import', bundle);
  c('seed import accepted', r.status < 300, r.text.slice(0, 200));
  await waitWritten(page, LATEST, w);
  const ledger = await exported(page);
  const latest = await read(page, LATEST);
  const side = JSON.parse((await read(page, `Allotr/devices/${id}/device.json`)) ?? 'null');
  c('sidecar names the device and the hash', side !== null && side.id === id && side.accounts === 1 && side.entries === 1 && /^[0-9a-f]{64}$/.test(side.sha256), JSON.stringify(side));
  c('latest backup written', latest !== null && JSON.parse(latest).accounts.length === 1);
  c('latest backup equals the export', latest === JSON.stringify(ledger) || JSON.stringify(JSON.parse(latest)) === JSON.stringify(ledger));
  c("today's dated copy written", (await read(page, today(id))) === latest, today(id));
  c('every write went through a temp file', (await page.evaluate(() => window.harness.renames.length)) >= 3);
  c('no temp file is left behind', (await files(page, 'Allotr/')).every((p) => !p.endsWith('.tmp')));
  c('the shared legacy file is not written', (await read(page, LEGACY)) === null);

  // 2. Unchanged: another save does not rewrite.
  w = await writesCount(page);
  await page.evaluate(() => window.plugin.getRuntime().then((rt) => { rt.markDirty(); return rt.flush(); }));
  await page.waitForTimeout(13000);
  c('unchanged bundle is not rewritten', (await writesCount(page)) === w);

  // 3. Pruning keeps the newest 7 dated copies.
  await page.evaluate((id) => {
    for (let i = 1; i <= 33; i++) {
      const day = String(i).padStart(2, '0');
      const path = `Allotr/devices/${id}/backups/allotr-2020-${i <= 28 ? '01' : '02'}-${i <= 28 ? day : String(i - 28).padStart(2, '0')}.json`;
      window.harness.app.vault.files.set(path, { file: { path, name: path, extension: 'json', stat: { ctime: 1, mtime: 1, size: 2 } }, data: '{}' });
    }
  }, id);
  w = await writesCount(page);
  r = await post(page, '/v1/accounts', { name: 'Jar', currency: 'EUR', openingBalance: { amountMinor: 500, currency: 'EUR' } });
  c('second change accepted', r.status < 300, r.text.slice(0, 200));
  await waitWritten(page, LATEST, w);
  await page.waitForTimeout(500);
  const dated = (await files(page, `Allotr/devices/${id}/backups/`)).filter((p) => /allotr-\d{4}-\d{2}-\d{2}\.json$/.test(p));
  c('7 dated copies kept', dated.length === 7, String(dated.length));
  c("today's copy survives pruning", dated.includes(today(id)));
  c('oldest copies removed', !dated.includes(`Allotr/devices/${id}/backups/allotr-2020-01-01.json`));
  const newest = JSON.parse(await read(page, LATEST));
  c('latest has both accounts', newest.accounts.length === 2);

  // 4. Scheduler: a tick records the weekly review reminder, without push.
  await page.evaluate(() => window.plugin.schedulerTick());
  const reminders = await page.evaluate(async () => {
    const rt = await window.plugin.getRuntime();
    return (await rt.fetch('/v1/reminders', { headers: { 'x-allotr-client': 'web', accept: 'application/json' } })).text();
  });
  c('scheduler tick records a reminder', /weekly_review/.test(reminders), reminders.slice(0, 160));

  // 5a. Database evicted (same device id) with one snapshot in the vault: it comes back without a question.
  await clearDevice(page, { keepId: true });
  await startPlugin(page);
  await page.evaluate(() => window.plugin.getRuntime());
  for (let i = 0; i < 60 && (await exported(page)).accounts.length !== 2; i++) await page.waitForTimeout(400);
  c('one snapshot is restored without a dialog', (await exported(page)).accounts.length === 2 && (await page.locator('.allotr-restore-text').count()) === 0);

  // 5. Database evicted (same device id) while another device's unrelated snapshot is also in the vault:
  // the restore modal appears; "Not now" leaves the ledger empty.
  const otherText = JSON.stringify({ ...bundle, accounts: [{ name: 'Elsewhere', currency: 'EUR', openingBalance: { amountMinor: 1, currency: 'EUR' } }], transactions: [] });
  await page.evaluate(
    ([t, sha]) => {
      const side = { format: 'allotr.device', id: 'other', name: 'Other 0001', savedAt: 1000, sha256: sha, accounts: 1, entries: 0, ancestors: [] };
      window.harness.loadFiles([
        { path: 'Allotr/devices/other/latest.json', data: t, mtime: 1000 },
        { path: 'Allotr/devices/other/device.json', data: JSON.stringify(side), mtime: 1000 },
      ], false);
    },
    [otherText, createHash('sha256').update(otherText).digest('hex')],
  );
  await clearDevice(page, { keepId: true });
  await startPlugin(page);
  await page.evaluate(() => window.plugin.getRuntime());
  await page.locator('.allotr-restore-text').waitFor();
  const text = await page.locator('.allotr-restore-text').textContent();
  c('restore modal names the backup', /vault backup \(.*, 2 accounts, 1 entries\)\?/.test(text), text);
  await page.locator('.allotr-restore-later').click();
  let after = await exported(page);
  c('Not now leaves the ledger empty', after.accounts.length === 0 && after.transactions.length === 0);
  await page.waitForTimeout(13000);
  c('empty ledger never overwrites the backup', JSON.parse(await read(page, LATEST)).accounts.length === 2);

  // 6. New data after declining keeps the old latest aside.
  w = await writesCount(page);
  await post(page, '/v1/import', { ...bundle, accounts: [{ name: 'Fresh', currency: 'EUR', openingBalance: { amountMinor: 100, currency: 'EUR' } }], transactions: [] });
  await waitWritten(page, LATEST, w);
  const kept = await read(page, `Allotr/devices/${id}/backups/allotr-before-new-data.json`);
  c('declined backup kept aside before overwrite', kept !== null && JSON.parse(kept).accounts.length === 2);

  // 7. A new device on the vault, offered the legacy shared file (newest): Restore brings the data back.
  await page.evaluate(([path, t]) => window.harness.app.vault.adapter.write(path, t), [LEGACY, JSON.stringify(newest)]);
  await clearDevice(page);
  await startPlugin(page);
  await page.evaluate(() => window.plugin.getRuntime());
  await page.locator('.allotr-restore-go').click();
  await page.waitForFunction(() => window.harness.state.notices.some((m) => /import done/.test(m)), null, { timeout: 30000 });
  after = await exported(page);
  c('Restore brings the data back', after.accounts.length === 2 && after.transactions.length === 1, `${after.accounts.length} accounts`);
  c('no backup file made of the empty ledger', (await files(page, 'Allotr backup')).length === 0 && (await files(page, 'Allotr export')).length === 0);

  // 8. Command with data: asks first, keeps a copy on the device (not in the vault), restores.
  const notices8 = await page.evaluate(() => window.harness.state.notices.length);
  await page.evaluate(() => window.harness.runCommand('Allotr: Restore Allotr data from vault backup'));
  await page.locator('.allotr-confirm-replace').waitFor();
  await page.locator('.allotr-confirm-replace').click();
  await page.waitForFunction((n) => window.harness.state.notices.slice(n).some((m) => /import done/.test(m)), notices8, { timeout: 30000 });
  c('restore command with data writes no backup file to the vault root', (await files(page, 'Allotr backup')).length === 0);
  await page.evaluate(() => window.harness.runCommand('Allotr: Restore an earlier Allotr copy from this device'));
  await page.locator('.allotr-safety-copy').first().waitFor();
  c('and keeps a copy of the replaced data on the device', (await page.locator('.allotr-safety-copy').count()) >= 1);
  await page.keyboard.press('Escape');

  // 9. A failing disk: one notice, no crash.
  await page.waitForTimeout(500);
  const notices0 = await page.evaluate(() => window.harness.state.notices.length);
  await page.evaluate(() => { window.harness.failWrites = true; });
  for (const name of ['A', 'B']) {
    w = await writesCount(page);
    await post(page, '/v1/accounts', { name, currency: 'EUR', openingBalance: { amountMinor: 1, currency: 'EUR' } });
    await page.waitForTimeout(13000);
  }
  const fails = await page.evaluate((n) => window.harness.state.notices.slice(n).filter((m) => /vault backup/.test(m)).length, notices0);
  c('write failure shows one notice per session', fails === 1, String(fails));
  await page.evaluate(() => { window.harness.failWrites = false; });

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
