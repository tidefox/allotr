// Two devices on one vault: per-device snapshots, the warning about newer data
// elsewhere, and reading damaged files. Each device is its own browser context
// (its own IndexedDB and local storage) with its own fake vault; "sync" copies
// files from one vault to the other, as a sync tool would. Made-up data only.
//   node harness/devices.mjs [chromium|webkit|all]
import { engines, newHarnessPage, startPlugin } from './lib.mjs';

const which = process.argv[2] ?? 'chromium';
let failures = 0;
function check(engine, name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${engine}] ${name}${detail ? ` -- ${detail}` : ''}`);
}

const bundle = (accounts, entries = 1) => ({
  format: 'allotr.bundle',
  version: 1,
  settings: { timeZone: 'UTC', defaultCurrency: 'EUR', paydayDay: 25 },
  categories: [{ name: 'Coffee', parent: 'Food' }],
  accounts: accounts.map((name) => ({ name, currency: 'EUR', openingBalance: { amountMinor: 12000, currency: 'EUR' } })),
  rates: [],
  transactions: Array.from({ length: entries }, (_, i) => ({
    kind: 'expense',
    ref: `coffee-${i}`,
    account: accounts[0],
    amount: { amountMinor: 350 + i, currency: 'EUR' },
    category: 'Food/Coffee',
    occurredOn: '2026-03-02',
    tags: [],
  })),
  bills: [],
});

const deviceId = (page) => page.evaluate(() => window.harness.app.loadLocalStorage('allotr-spike-vault-id'));
const read = (page, path) => page.evaluate((p) => window.harness.readFile(p), path);
const files = (page, prefix) =>
  page.evaluate((p) => window.harness.app.vault.getFiles().map((f) => f.path).filter((x) => x.startsWith(p)), prefix);
const post = (page, path, body) =>
  page.evaluate(
    async ([p, b]) => {
      const runtime = await window.plugin.getRuntime();
      const r = await runtime.fetch(p, { method: 'POST', headers: { 'x-allotr-client': 'web', 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(b) });
      return { status: r.status, text: await r.text() };
    },
    [path, body],
  );
const exported = (page) =>
  page.evaluate(async () => {
    const runtime = await window.plugin.getRuntime();
    return (await runtime.fetch('/v1/export?format=json', { headers: { 'x-allotr-client': 'web' } })).json();
  });
const writesCount = (page) => page.evaluate(() => window.harness.writes.length);
const waitWritten = (page, path, since) =>
  page.waitForFunction(([p, n]) => window.harness.writes.slice(n).includes(p), [path, since], { timeout: 40000 });
const modalText = (page, selector) => page.locator(selector).first().textContent();
const modals = (page) => page.evaluate(() => document.querySelectorAll('.modal-container').length);

/** A sync tool: copies the files under `prefix` from one vault to another. */
async function sync(from, to, prefix = 'Allotr/') {
  const list = await from.evaluate((p) => window.harness.dumpFiles(p), prefix);
  await to.evaluate((l) => window.harness.loadFiles(l), list);
}

async function restart(page) {
  await page.evaluate(async () => {
    await window.harness.unloadPlugin(window.plugin);
    await new Promise((r) => setTimeout(r, 500));
  });
  await startPlugin(page);
  await page.evaluate(() => window.plugin.getRuntime());
  // The start-up check runs after the runtime opens.
  await page.waitForTimeout(1500);
}

async function device(browser, vault) {
  const { context, page } = await newHarnessPage(browser, { query: `?vault=${vault}` });
  await startPlugin(page);
  await page.evaluate(() => window.plugin.getRuntime());
  return { context, page };
}

async function run(engine, browser) {
  const c = (name, ok, detail) => check(engine, name, ok, detail);
  const stamp = Date.now();

  // A fresh device has the starter data (categories, Buffer, pools).
  const A = await device(browser, `a-${stamp}`);
  const startersOf = (page) =>
    page.evaluate(async () => {
      const db = (await window.plugin.getRuntime()).db;
      const n = async (table) => Number((await db.selectFrom(table).select((eb) => eb.fn.countAll().as('n')).executeTakeFirstOrThrow()).n);
      const buffer = await db.selectFrom('budgets').select('id').where('kind', '=', 'buffer').execute();
      const ledger = await db.selectFrom('users').select('ledger_id').executeTakeFirstOrThrow();
      return { categories: await n('categories'), pools: await n('pools'), buffers: buffer.length, ledgerId: ledger.ledger_id };
    });
  const fresh = await startersOf(A.page);
  c('a fresh device has starter categories', fresh.categories > 10, String(fresh.categories));
  c('a fresh device has the Buffer and both pools', fresh.buffers === 1 && fresh.pools === 2, JSON.stringify(fresh));
  c('a fresh device has its own ledger id', /^[0-9a-f-]{36}$/.test(fresh.ledgerId));
  const idA = await deviceId(A.page);

  // A user row left by an earlier build, never seeded, is repaired once on open.
  await A.page.evaluate(async () => {
    const db = (await window.plugin.getRuntime()).db;
    await db.deleteFrom('categories').execute();
    await db.deleteFrom('budget_amounts').execute();
    await db.deleteFrom('budgets').execute();
    await db.deleteFrom('pools').execute();
    (await window.plugin.getRuntime()).markDirty();
    await (await window.plugin.getRuntime()).flush();
  });
  await restart(A.page);
  const repaired = await startersOf(A.page);
  c('an unseeded user is seeded on open', repaired.categories > 10 && repaired.buffers === 1, JSON.stringify(repaired));
  c('the repair keeps the ledger id', repaired.ledgerId === fresh.ledgerId);
  await A.page.evaluate(async () => {
    const db = (await window.plugin.getRuntime()).db;
    const leaf = await db.selectFrom('categories').select('id').where('parent_id', 'is not', null).executeTakeFirstOrThrow();
    await db.deleteFrom('categories').where('id', '=', leaf.id).execute();
    (await window.plugin.getRuntime()).markDirty();
    await (await window.plugin.getRuntime()).flush();
  });
  const before = await startersOf(A.page);
  await restart(A.page);
  const again = await startersOf(A.page);
  c('a seeded ledger is not seeded again on open', again.categories === before.categories, `${before.categories} -> ${again.categories}`);

  // A writes its own snapshot; no .tmp is left and the shared file is not used.
  let w = await writesCount(A.page);
  let r = await post(A.page, '/v1/import', bundle(['Wallet', 'Jar']));
  c('A imports data', r.status < 300, r.text.slice(0, 120));
  await waitWritten(A.page, `Allotr/devices/${idA}/device.json`, w);
  c('A wrote only inside its own folder', (await files(A.page, 'Allotr/')).every((p) => p.startsWith(`Allotr/devices/${idA}/`)));
  c('no temp files are left', (await files(A.page, 'Allotr/')).every((p) => !p.endsWith('.tmp')));

  // B is a new device; the vault arrives by sync: it offers A's data.
  const B = await device(browser, `b-${stamp}`);
  const idB = await deviceId(B.page);
  c('devices have different ids', idA !== idB);
  await sync(A.page, B.page);
  await restart(B.page);
  await B.page.locator('.allotr-restore-text').waitFor();
  const offer = await modalText(B.page, '.allotr-restore-text');
  c('B is offered the data from A', /Desktop .*2 accounts, 1 entries/.test(offer), offer);
  await B.page.locator('.allotr-restore-go').click();
  await B.page.waitForFunction(() => window.harness.state.notices.some((m) => /import done/.test(m)), null, { timeout: 30000 });
  c('B has A\'s accounts', (await exported(B.page)).accounts.length === 2);
  await B.page.waitForTimeout(1500);
  c('no warning after a restore', (await modals(B.page)) === 0);

  // B adds data and writes; A starts and is warned.
  w = await writesCount(B.page);
  r = await post(B.page, '/v1/accounts', { name: 'B card', currency: 'EUR', openingBalance: { amountMinor: 700, currency: 'EUR' } });
  c('B adds an account', r.status < 300, r.text.slice(0, 120));
  await waitWritten(B.page, `Allotr/devices/${idB}/device.json`, w);
  const sideB = JSON.parse(await read(B.page, `Allotr/devices/${idB}/device.json`));
  c('B records where its data came from', sideB.basedOn?.device === idA, JSON.stringify(sideB.basedOn));
  await sync(B.page, A.page);
  const writesA = await writesCount(A.page);
  await restart(A.page);
  await A.page.locator('.allotr-divergence-text').waitFor();
  const warning = await modalText(A.page, '.allotr-divergence-text');
  c('A is warned about B\'s newer data', /3 accounts/.test(warning) && /This device has 2 accounts/.test(warning), warning);
  c('the warning names the other device', warning.includes(sideB.name), sideB.name);
  await A.page.evaluate(async () => {
    const rt = await window.plugin.getRuntime();
    rt.markDirty();
    await rt.flush();
  });
  await A.page.waitForTimeout(13000);
  const wroteWhileHeld = (await A.page.evaluate((n) => window.harness.writes.slice(n), writesA)).filter((p) => p.startsWith('Allotr/'));
  c('A writes nothing to the vault while the warning is open', wroteWhileHeld.length === 0, wroteWhileHeld.join(','));

  // "Keep mine": no repeat of the same warning on the next start.
  await A.page.locator('.allotr-divergence-keep').click();
  await restart(A.page);
  c('"Keep mine" is not asked again for the same data', (await modals(A.page)) === 0);

  // B changes again: a new snapshot, a new warning for A.
  w = await writesCount(B.page);
  await post(B.page, '/v1/accounts', { name: 'B jar', currency: 'EUR', openingBalance: { amountMinor: 50, currency: 'EUR' } });
  await waitWritten(B.page, `Allotr/devices/${idB}/device.json`, w);
  await sync(B.page, A.page);
  await restart(A.page);
  await A.page.locator('.allotr-divergence-text').waitFor();
  c('newer data from B asks again', /4 accounts/.test(await modalText(A.page, '.allotr-divergence-text')));

  // "Save both copies" puts both in the vault root and leaves the choice open.
  await A.page.locator('.allotr-divergence-both').click();
  await A.page.waitForFunction(() => window.harness.app.vault.getFiles().filter((f) => !f.path.startsWith('Allotr/') && /^Allotr .*\.json$/.test(f.path)).length >= 2, null, { timeout: 20000 });
  c('both copies are saved to the vault root', true);
  c('the choice is still open after saving both', (await modals(A.page)) === 1);

  // "Replace mine": A becomes B's data, is not warned again, and records the source.
  await A.page.locator('.allotr-divergence-replace').click();
  await A.page.locator('.allotr-confirm-replace').click();
  await A.page.waitForFunction(() => window.harness.state.notices.some((m) => /import done/.test(m)), null, { timeout: 30000 });
  c('A now has B\'s accounts', (await exported(A.page)).accounts.length === 4);
  const exportedAfter = await exported(A.page);
  const bundleB = JSON.parse(await read(B.page, `Allotr/devices/${idB}/latest.json`));
  console.log(`INFO [${engine}] re-export after a replace is ${JSON.stringify(exportedAfter) === JSON.stringify(bundleB) ? '' : 'NOT '}identical to the source snapshot`);
  w = await writesCount(A.page);
  await A.page.waitForTimeout(500);
  await restart(A.page);
  c('A is not warned about the snapshot it was replaced from', (await modals(A.page)) === 0);
  const sideA = JSON.parse((await read(A.page, `Allotr/devices/${idA}/device.json`)) ?? 'null');
  c('A\'s sidecar names B as its source', sideA?.basedOn?.device === idB, JSON.stringify(sideA?.basedOn));

  // Identical data is not a warning: the same text under another, newer device folder.
  const text = await read(A.page, `Allotr/devices/${idA}/latest.json`);
  await A.page.evaluate(
    ([t]) => window.harness.loadFiles([
      { path: 'Allotr/devices/ghost/latest.json', data: t, mtime: Date.now() + 60000 },
    ]),
    [text],
  );
  await restart(A.page);
  c('identical data on another device is not a warning', (await modals(A.page)) === 0);

  // A damaged latest.json: a new device reads the newest dated copy instead.
  const dated = (await files(B.page, `Allotr/devices/${idB}/backups/`)).find((p) => /allotr-\d{4}-\d{2}-\d{2}\.json$/.test(p));
  const D = await device(browser, `d-${stamp}`);
  await sync(B.page, D.page);
  await D.page.evaluate((id) => {
    const half = window.harness.readFile(`Allotr/devices/${id}/latest.json`).slice(0, 200);
    window.harness.app.vault.files.get(`Allotr/devices/${id}/latest.json`).data = half;
  }, idB);
  await restart(D.page);
  await D.page.locator('.allotr-restore-text').waitFor();
  const fallback = await modalText(D.page, '.allotr-restore-text');
  c('a cut-short latest.json falls back to a dated copy', !!dated && /4 accounts/.test(fallback), fallback);
  await D.page.locator('.allotr-restore-go').click();
  await D.page.waitForFunction(() => window.harness.state.notices.some((m) => /import done/.test(m)), null, { timeout: 30000 });
  c('and restoring from it works', (await exported(D.page)).accounts.length === 4);
  await D.context.close();

  // A finished temp file is read when the rename never happened.
  const E = await device(browser, `e-${stamp}`);
  await E.page.evaluate(
    ([t]) => {
      window.harness.loadFiles([{ path: 'Allotr/devices/cut/latest.json.tmp', data: t, mtime: Date.now() }]);
    },
    [text],
  );
  await restart(E.page);
  await E.page.locator('.allotr-restore-text').waitFor();
  c('a finished temp file is offered when latest.json is missing', /4 accounts/.test(await modalText(E.page, '.allotr-restore-text')));
  await E.context.close();

  // The legacy shared file is offered on a new device.
  const F = await device(browser, `f-${stamp}`);
  await F.page.evaluate(([t]) => window.harness.loadFiles([{ path: 'Allotr/allotr-latest.json', data: t, mtime: Date.now() }]), [text]);
  await restart(F.page);
  await F.page.locator('.allotr-restore-text').waitFor();
  const legacy = await modalText(F.page, '.allotr-restore-text');
  c('the legacy shared file is offered on a new device', /earlier version/.test(legacy) && /4 accounts/.test(legacy), legacy);
  await F.page.locator('.allotr-restore-later').click();
  await F.context.close();

  // ...and warns a device that has data of its own.
  const G = await device(browser, `g-${stamp}`);
  await post(G.page, '/v1/import', bundle(['Solo']));
  await restart(G.page); // saves, and writes G's own snapshot first
  await G.page.waitForTimeout(1500);
  await G.page.evaluate(([t]) => window.harness.loadFiles([{ path: 'Allotr/allotr-latest.json', data: t, mtime: Date.now() + 1000 }]), [text]);
  await restart(G.page);
  await G.page.locator('.allotr-divergence-text').waitFor();
  c('the legacy shared file also triggers the warning', /earlier version/.test(await modalText(G.page, '.allotr-divergence-text')));
  await G.context.close();

  // Late arrival: B saves and the file reaches A while A stays open; A saves later; A's next start still warns.
  const A2 = await device(browser, `a2-${stamp}`);
  const idA2 = await deviceId(A2.page);
  w = await writesCount(A2.page);
  await post(A2.page, '/v1/import', bundle(['Desk']));
  await waitWritten(A2.page, `Allotr/devices/${idA2}/device.json`, w);
  const B2 = await device(browser, `b2-${stamp}`);
  const idB2 = await deviceId(B2.page);
  await sync(A2.page, B2.page);
  await restart(B2.page);
  await B2.page.locator('.allotr-restore-go').click();
  await B2.page.waitForFunction(() => window.harness.state.notices.some((m) => /import done/.test(m)), null, { timeout: 30000 });
  w = await writesCount(B2.page);
  await post(B2.page, '/v1/accounts', { name: 'Phone only', currency: 'EUR', openingBalance: { amountMinor: 900, currency: 'EUR' } });
  await waitWritten(B2.page, `Allotr/devices/${idB2}/device.json`, w);
  await sync(B2.page, A2.page); // arrives while A2 is open
  await A2.page.waitForTimeout(1200);
  w = await writesCount(A2.page);
  await post(A2.page, '/v1/accounts', { name: 'Desk jar', currency: 'EUR', openingBalance: { amountMinor: 100, currency: 'EUR' } });
  await waitWritten(A2.page, `Allotr/devices/${idA2}/device.json`, w);
  const sideA2 = JSON.parse(await read(A2.page, `Allotr/devices/${idA2}/device.json`));
  const sideB2 = JSON.parse(await read(B2.page, `Allotr/devices/${idB2}/device.json`));
  c('A saved after B (the case a time comparison misses)', sideA2.savedAt > sideB2.savedAt);
  await restart(A2.page);
  await A2.page.locator('.allotr-divergence-text').waitFor();
  const late = await modalText(A2.page, '.allotr-divergence-text');
  c('A is warned although its own last save is later', late.includes(sideB2.name) && /last saved 2 accounts/.test(late), late);
  await A2.page.locator('.allotr-divergence-keep').click();

  // A device that stays open is warned by the periodic check, without a restart.
  w = await writesCount(B2.page);
  await post(B2.page, '/v1/accounts', { name: 'Phone jar', currency: 'EUR', openingBalance: { amountMinor: 20, currency: 'EUR' } });
  await waitWritten(B2.page, `Allotr/devices/${idB2}/device.json`, w);
  await sync(B2.page, A2.page);
  await A2.page.evaluate(() => window.plugin.periodic());
  await A2.page.locator('.allotr-divergence-text').waitFor();
  c('the periodic check warns an open device', true);
  // Closed without an answer: nothing is written meanwhile, and the next check asks again (once).
  await A2.page.keyboard.press('Escape');
  c('Escape closes the warning', (await modals(A2.page)) === 0);
  const wA2 = await writesCount(A2.page);
  await A2.page.evaluate(async () => {
    const rt = await window.plugin.getRuntime();
    rt.markDirty();
    await rt.flush();
  });
  await A2.page.waitForTimeout(13000);
  c('vault writes stay paused until the question is answered', (await writesCount(A2.page)) === wA2);
  await A2.page.evaluate(() => Promise.all([window.plugin.periodic(), window.plugin.periodic()]));
  await A2.page.waitForTimeout(500);
  c('the next check asks again, without stacking dialogs', (await modals(A2.page)) === 1);

  // The source is not warned about a device that only holds what it replaced from.
  await A2.page.keyboard.press('Escape');
  await restart(A2.page);
  await A2.page.locator('.allotr-divergence-replace').click();
  await A2.page.locator('.allotr-confirm-replace').click();
  await A2.page.waitForFunction(() => window.harness.state.notices.some((m) => /import done/.test(m)), null, { timeout: 30000 });
  w = await writesCount(A2.page);
  await A2.page.waitForTimeout(13000);
  await sync(A2.page, B2.page);
  const sideA2b = JSON.parse(await read(A2.page, `Allotr/devices/${idA2}/device.json`));
  c('A records the hash of its own export of B\'s data', typeof sideA2b.basedOn?.selfSha256 === 'string', JSON.stringify(sideA2b.basedOn));
  await restart(B2.page);
  c('B is not warned about A after A only took B\'s data', (await modals(B2.page)) === 0);

  // B keeps working after A took its data: A's snapshot is now older than B's, and is not news.
  w = await writesCount(B2.page);
  await post(B2.page, '/v1/accounts', { name: 'Phone extra', currency: 'EUR', openingBalance: { amountMinor: 10, currency: 'EUR' } });
  await waitWritten(B2.page, `Allotr/devices/${idB2}/device.json`, w);
  await sync(A2.page, B2.page);
  await restart(B2.page);
  c('B is not warned about an older snapshot built from its own earlier data', (await modals(B2.page)) === 0);
  await B2.page.evaluate(() => window.plugin.periodic());
  await B2.page.waitForTimeout(500);
  c('nor by the periodic check', (await modals(B2.page)) === 0);

  // The share sheet: on a desktop the export downloads; on a phone it never falls back to a download.
  const downloadPromise = A.page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await A.page.evaluate(() => window.harness.runCommand('Allotr: Export Allotr data outside the vault'));
  await A.page.locator('.allotr-export-text').waitFor();
  await A.page.locator('.allotr-export-go').click();
  const download = await downloadPromise;
  c('the outside-the-vault export downloads a bundle', download !== null && /^allotr-export-.*\.json$/.test(download.suggestedFilename()), download?.suggestedFilename());
  if (download !== null) {
    const { readFileSync } = await import('node:fs');
    const body = JSON.parse(readFileSync(await download.path(), 'utf8'));
    c('the downloaded file is an importable bundle', body.format === 'allotr.bundle' && body.accounts.length === 4);
  }
  c('the outside export wrote nothing into the vault', (await files(A.page, 'allotr-export')).length === 0);

  const P = await newHarnessPage(browser, { query: `?vault=phone-${stamp}&platform=ios` });
  await startPlugin(P.page);
  await P.page.evaluate(() => window.plugin.getRuntime());
  await post(P.page, '/v1/import', bundle(['Phone wallet']));
  // No share sheet in this browser: the phone must say so, not download.
  await P.page.evaluate(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; });
  const phoneDownload = P.page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
  await P.page.evaluate(() => window.harness.runCommand('Allotr: Export Allotr data outside the vault'));
  await P.page.locator('.allotr-export-go').click();
  await P.page.waitForFunction(() => window.harness.state.notices.some((m) => /nothing was saved outside the vault/.test(m)), null, { timeout: 10000 });
  c('a phone without a share sheet reports failure', true);
  c('and does not fall back to a download', (await phoneDownload) === null);
  c('the dialog stays open for another try', (await modals(P.page)) === 1);
  // With a working share sheet the file is handed over.
  await P.page.evaluate(() => {
    window.__shared = null;
    Navigator.prototype.canShare = () => true;
    Navigator.prototype.share = async (data) => { window.__shared = { name: data.files[0].name, size: data.files[0].size }; };
  });
  await P.page.locator('.allotr-export-go').click();
  await P.page.waitForFunction(() => window.__shared !== null, null, { timeout: 10000 });
  const shared = await P.page.evaluate(() => window.__shared);
  c('a phone with a share sheet shares the file', /^allotr-export-.*\.json$/.test(shared.name) && shared.size > 100, JSON.stringify(shared));
  await P.context.close();
  await A2.context.close();
  await B2.context.close();

  const errors = [A, B].flatMap(({ page }) => page.logs.filter((l) => l.startsWith('pageerror')));
  c('no page errors', errors.length === 0, errors.join(' | '));
  await A.context.close();
  await B.context.close();
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
