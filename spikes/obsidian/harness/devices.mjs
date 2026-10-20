// Two devices on one vault: per-device snapshots, the warning about newer data
// elsewhere, and reading damaged files. Each device is its own browser context
// (its own IndexedDB and local storage) with its own fake vault; "sync" copies
// files from one vault to the other, as a sync tool would. Made-up data only.
//   node harness/devices.mjs [chromium|webkit|all] [quiet]
import { engines, newHarnessPage, startPlugin } from './lib.mjs';

const which = process.argv[2] ?? 'chromium';
// "quiet" runs only the scenarios of the quiet sync (fast-forward, conflicts asked once, safety copies, retention).
const part = process.argv[3] ?? 'all';
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

/** A sync tool: copies the files under `prefix` from one vault to another, and (by default) tells Obsidian, which fires the vault events. */
async function sync(from, to, prefix = 'Allotr/', events = true) {
  const list = await from.evaluate((p) => window.harness.dumpFiles(p), prefix);
  await to.evaluate(([l, e]) => window.harness.loadFiles(l, e), [list, events]);
}

const accountNames = (page) => exported(page).then((b) => b.accounts.map((a) => a.name).sort());
/** Reads the account names of the running runtime; null while there is none (the plugin is swapping it). Asking the plugin for a runtime then would open the old data. */
const runningNames = (page) =>
  page.evaluate(async () => {
    const runtime = window.plugin.runtime;
    if (!runtime) return null;
    try {
      return (await (await runtime.fetch('/v1/export?format=json', { headers: { 'x-allotr-client': 'web' } })).json()).accounts.map((a) => a.name);
    } catch {
      return null;
    }
  });
/** Polls until `done(names)` holds (taking another device's data has no notice to wait for). */
async function waitNames(page, done, what, timeout = 40000) {
  const end = Date.now() + timeout;
  for (;;) {
    const names = await runningNames(page);
    if (names !== null && done(names)) return names;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}; accounts: ${JSON.stringify(names)}`);
    await page.waitForTimeout(400);
  }
}
const waitAccounts = (page, n) => waitNames(page, (names) => names.length === n, `${n} accounts`);
const noticeCount = (page) => page.evaluate(() => window.harness.state.notices.length);
const vaultRootFiles = (page) =>
  page.evaluate(() => window.harness.app.vault.getFiles().map((f) => f.path).filter((p) => !p.startsWith('Allotr/')));

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

const openPages = [];
async function device(browser, vault) {
  const { context, page } = await newHarnessPage(browser, { query: `?vault=${vault}` });
  openPages.push([vault, page]);
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
  const noticesB = await noticeCount(B.page);
  await restart(B.page);
  // One snapshot holds everything in the vault: B takes it without being asked.
  await waitAccounts(B.page, 2);
  c('B takes A\'s data without a dialog', (await modals(B.page)) === 0);
  c('and without a notice', (await noticeCount(B.page)) === noticesB);
  await B.page.waitForTimeout(1500);
  c('no warning after a restore', (await modals(B.page)) === 0);

  // B adds data and writes; A starts and is warned.
  w = await writesCount(B.page);
  r = await post(B.page, '/v1/accounts', { name: 'B card', currency: 'EUR', openingBalance: { amountMinor: 700, currency: 'EUR' } });
  c('B adds an account', r.status < 300, r.text.slice(0, 120));
  await waitWritten(B.page, `Allotr/devices/${idB}/device.json`, w);
  const sideB = JSON.parse(await read(B.page, `Allotr/devices/${idB}/device.json`));
  c('B records where its data came from', sideB.basedOn?.device === idA, JSON.stringify(sideB.basedOn));
  // A changed too since they last agreed, so B's data is a conflict (had A not changed, it would fast-forward).
  w = await writesCount(A.page);
  await post(A.page, '/v1/accounts', { name: 'A jar', currency: 'EUR', openingBalance: { amountMinor: 300, currency: 'EUR' } });
  await waitWritten(A.page, `Allotr/devices/${idA}/device.json`, w);
  await sync(B.page, A.page, `Allotr/devices/${idB}/`, false);
  const writesA = await writesCount(A.page);
  await restart(A.page);
  await A.page.locator('.allotr-divergence-text').waitFor();
  const warning = await modalText(A.page, '.allotr-divergence-text');
  c('A is warned about B\'s conflicting data', /3 accounts/.test(warning) && /This device has 3 accounts/.test(warning), warning);
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
  await sync(B.page, A.page, `Allotr/devices/${idB}/`, false);
  await restart(A.page);
  await A.page.locator('.allotr-divergence-text').waitFor();
  c('newer data from B asks again', /4 accounts/.test(await modalText(A.page, '.allotr-divergence-text')));

  // "Keep both as files" puts both in the vault root and leaves the choice open.
  await A.page.locator('.allotr-divergence-both').click();
  await A.page.waitForFunction(() => window.harness.app.vault.getFiles().filter((f) => !f.path.startsWith('Allotr/') && /^Allotr .*\.json$/.test(f.path)).length >= 2, null, { timeout: 20000 });
  c('both copies are saved to the vault root', true);
  c('the choice is still open after saving both', (await modals(A.page)) === 1);

  // "Use theirs": A becomes B's data without a further question or a notice, is not warned again, and records the source.
  const noticesA = await noticeCount(A.page);
  await A.page.locator('.allotr-divergence-replace').click();
  await waitAccounts(A.page, 4);
  c('A now has B\'s accounts', (await exported(A.page)).accounts.length === 4);
  c('"Use theirs" asks nothing more and shows no notice', (await modals(A.page)) === 0 && (await noticeCount(A.page)) === noticesA);
  const rootAfter = (await vaultRootFiles(A.page)).filter((p) => /backup/i.test(p));
  c('taking the data wrote no backup file to the vault root', rootAfter.length === 0, rootAfter.join(','));
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
  await waitAccounts(B2.page, 1);
  w = await writesCount(B2.page);
  await post(B2.page, '/v1/accounts', { name: 'Phone only', currency: 'EUR', openingBalance: { amountMinor: 900, currency: 'EUR' } });
  await waitWritten(B2.page, `Allotr/devices/${idB2}/device.json`, w);
  await sync(B2.page, A2.page, 'Allotr/', false); // arrives while A2 is open, without Obsidian being told
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
  await sync(B2.page, A2.page, 'Allotr/', false);
  await A2.page.evaluate(() => window.plugin.periodic());
  await A2.page.locator('.allotr-divergence-text').waitFor();
  c('the periodic check warns an open device', true);
  // Closed without an answer: nothing is written meanwhile, and the periodic check does not ask again.
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
  c('the periodic check does not reopen a closed question', (await modals(A2.page)) === 0);
  c('the hold stays on', await A2.page.evaluate(() => window.plugin.backup.isHeld));
  await A2.page.evaluate(() => window.harness.runCommand('Allotr: Check other devices for newer Allotr data'));
  c('the command asks again, once', (await modals(A2.page)) === 1);

  // The source is not warned about a device that only holds what it replaced from.
  await A2.page.keyboard.press('Escape');
  await restart(A2.page);
  await A2.page.locator('.allotr-divergence-replace').click();
  await waitAccounts(A2.page, 3);
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


/** The quiet sync: fast-forward without asking, conflicts asked once, half-delivered files, safety copies, retention. */
async function quiet(engine, browser) {
  const c = (name, ok, detail) => check(engine, name, ok, detail);
  const stamp = Date.now();
  const hasAccount = (page, name) => waitNames(page, (names) => names.includes(name), `account ${name}`);
  const addAccount = async (page, id, name) => {
    const w = await writesCount(page);
    await post(page, '/v1/accounts', { name, currency: 'EUR', openingBalance: { amountMinor: 100, currency: 'EUR' } });
    await waitWritten(page, `Allotr/devices/${id}/device.json`, w);
  };
  const own = (id) => `Allotr/devices/${id}/`;

  // Fast-forward: A writes, B takes it (empty device), B edits, A takes B's edit with no dialog and no notice.
  const A = await device(browser, `qa-${stamp}`);
  const idA = await deviceId(A.page);
  const B = await device(browser, `qb-${stamp}`);
  const idB = await deviceId(B.page);
  let w = await writesCount(A.page);
  await post(A.page, '/v1/import', bundle(['Ledger']));
  await waitWritten(A.page, `${own(idA)}device.json`, w);
  await sync(A.page, B.page, own(idA));
  await waitAccounts(B.page, 1);
  c('an empty device takes the vault data when the files arrive, without a dialog', (await modals(B.page)) === 0);
  await addAccount(B.page, idB, 'B jar');
  const sideB = JSON.parse(await read(B.page, `${own(idB)}device.json`));
  c('B\'s sidecar lists A\'s snapshot among the states it descends from', sideB.ancestors?.includes(JSON.parse(await read(A.page, `${own(idA)}device.json`)).sha256), String(sideB.ancestors?.length));
  const noticesA = await noticeCount(A.page);
  await sync(B.page, A.page, own(idB));
  await waitAccounts(A.page, 2);
  c('A fast-forwards to B\'s edit with no dialog', (await modals(A.page)) === 0);
  c('and no notice', (await noticeCount(A.page)) === noticesA);
  const namesA = await accountNames(A.page);
  c('the data is equal on both devices', JSON.stringify(namesA) === JSON.stringify(await accountNames(B.page)), namesA.join(','));
  c('taking the data wrote nothing to the vault root', (await vaultRootFiles(A.page)).length === 0 && (await vaultRootFiles(B.page)).length === 0);

  // Both edit after a common state: one dialog on each side. "Keep mine" on A lets B fast-forward to A.
  await addAccount(A.page, idA, 'A only');
  await addAccount(B.page, idB, 'B only');
  await sync(A.page, B.page, own(idA));
  await sync(B.page, A.page, own(idB));
  await A.page.locator('.allotr-divergence-text').waitFor();
  await B.page.locator('.allotr-divergence-text').waitFor();
  await A.page.waitForTimeout(1500);
  c('a conflict opens one dialog on each side', (await modals(A.page)) === 1 && (await modals(B.page)) === 1);
  c('the dialog offers the three choices', (await A.page.locator('.allotr-divergence-replace, .allotr-divergence-keep, .allotr-divergence-both').allTextContents()).join('|') === 'Keep both as files|Keep mine|Use theirs');
  w = await writesCount(A.page);
  await A.page.locator('.allotr-divergence-keep').click();
  await waitWritten(A.page, `${own(idA)}device.json`, w);
  const wrote = await A.page.evaluate((n) => window.harness.writes.slice(n), w);
  c('"Keep mine" writes the sidecar although the bundle is unchanged', !wrote.includes(`${own(idA)}latest.json`), wrote.join(','));
  const sideA = JSON.parse(await read(A.page, `${own(idA)}device.json`));
  const sideB2 = JSON.parse(await read(B.page, `${own(idB)}device.json`));
  c('A lists B\'s snapshot among its ancestors', sideA.ancestors.includes(sideB2.sha256));
  await B.page.keyboard.press('Escape');
  const noticesB = await noticeCount(B.page);
  await sync(A.page, B.page, own(idA));
  await hasAccount(B.page, 'A only');
  c('B fast-forwards to A with no dialog', (await modals(B.page)) === 0);
  c('and no notice', (await noticeCount(B.page)) === noticesB);
  c('B\'s hold is released', !(await B.page.evaluate(() => window.plugin.backup.isHeld)));
  c('B no longer has its own conflicting edit', !(await accountNames(B.page)).includes('B only'));

  // A file that arrives before its sidecar, or the sidecar before its file, is not a disagreement.
  await addAccount(A.page, idA, 'Late sidecar');
  await sync(A.page, B.page, `${own(idA)}device.json`);
  await B.page.waitForTimeout(5500);
  c('a sidecar that arrives before its file starts nothing', (await modals(B.page)) === 0 && !(await accountNames(B.page)).includes('Late sidecar'));
  await sync(A.page, B.page, `${own(idA)}latest.json`);
  await hasAccount(B.page, 'Late sidecar');
  c('the file arriving completes the step', (await modals(B.page)) === 0);
  await addAccount(A.page, idA, 'Late file');
  await sync(A.page, B.page, `${own(idA)}latest.json`);
  await B.page.waitForTimeout(5500);
  c('a file that arrives before its sidecar is no conflict and no step', (await modals(B.page)) === 0 && !(await accountNames(B.page)).includes('Late file'));
  await sync(A.page, B.page, `${own(idA)}device.json`);
  await hasAccount(B.page, 'Late file');
  c('the sidecar arriving completes the step', (await modals(B.page)) === 0);

  // Safety copy: the state B replaced is listed on B and can be put back.
  await B.page.evaluate(() => window.harness.runCommand('Allotr: Restore an earlier Allotr copy from this device'));
  await B.page.locator('.allotr-safety-copy').first().waitFor();
  const copies = await B.page.locator('.allotr-safety-copy').allTextContents();
  c('B lists the states it replaced (newest first)', copies.length >= 3 && /4 accounts/.test(copies[0]) && /before taking/.test(copies[0]), copies.join(' | '));
  await B.page.locator('.allotr-safety-copy').first().click();
  await B.page.locator('.allotr-confirm-replace').click();
  await waitAccounts(B.page, 4);
  const restored = await accountNames(B.page);
  c('restoring a copy puts that state back', restored.includes('Late sidecar') && !restored.includes('Late file'), restored.join(','));
  await B.page.evaluate(() => window.harness.runCommand('Allotr: Restore an earlier Allotr copy from this device'));
  await B.page.locator('.allotr-safety-copy').first().waitFor();
  const afterRestore = await B.page.locator('.allotr-safety-copy').allTextContents();
  c('the data a restore replaced is kept as a copy too', afterRestore.length > copies.length && /5 accounts/.test(afterRestore[0]), afterRestore[0]);
  await B.page.keyboard.press('Escape');
  const errorsQ = [A, B].flatMap(({ page }) => page.logs.filter((l) => l.startsWith('pageerror')));
  c('no page errors', errorsQ.length === 0, errorsQ.join(' | '));
  await A.context.close();
  await B.context.close();

  // An explicit restore wins: C takes D's edit, restores the earlier local copy, D edits on top of the
  // state C overrode, and C keeps the restored data instead of silently reverting.
  const C = await device(browser, `qc-${stamp}`);
  const idC = await deviceId(C.page);
  const D = await device(browser, `qd-${stamp}`);
  const idD = await deviceId(D.page);
  w = await writesCount(C.page);
  await post(C.page, '/v1/import', bundle(['Ledger']));
  await waitWritten(C.page, `${own(idC)}device.json`, w);
  await sync(C.page, D.page, own(idC));
  await waitAccounts(D.page, 1);
  await addAccount(D.page, idD, 'D jar');
  await sync(D.page, C.page, own(idD));
  await waitAccounts(C.page, 2);
  await C.page.evaluate(() => window.harness.runCommand('Allotr: Restore an earlier Allotr copy from this device'));
  await C.page.locator('.allotr-safety-copy').first().click();
  await C.page.locator('.allotr-confirm-replace').click();
  await waitNames(C.page, (names) => names.length === 1 && names[0] === 'Ledger', 'the restored state');
  await addAccount(D.page, idD, 'D two');
  await sync(D.page, C.page, own(idD));
  await C.page.waitForTimeout(7000);
  c('a restored state is not silently reverted by the next edit elsewhere', JSON.stringify(await runningNames(C.page)) === '["Ledger"]', JSON.stringify(await runningNames(C.page)));
  await C.page.keyboard.press('Escape');
  await C.context.close();
  await D.context.close();

  // Retention: ten simulated days leave seven dated copies; stale leftovers of this device go, other devices' files stay.
  const H = await device(browser, `qh-${stamp}`);
  const idH = await deviceId(H.page);
  await post(H.page, '/v1/import', bundle(['Ledger']));
  await H.page.evaluate(() => {
    const Real = Date;
    window.__days = 0;
    globalThis.Date = class extends Real {
      constructor(...args) {
        if (args.length === 0) super(Real.now() + window.__days * 86400000);
        else super(...args);
      }
      static now() {
        return Real.now() + window.__days * 86400000;
      }
    };
  });
  for (let day = 0; day < 10; day++) {
    await H.page.evaluate((d) => { window.__days = d; }, day);
    await post(H.page, '/v1/accounts', { name: `Day ${day}`, currency: 'EUR', openingBalance: { amountMinor: 10, currency: 'EUR' } });
    await H.page.evaluate(() => window.plugin.backup.writeNow());
  }
  const datedNow = async () => (await files(H.page, `${own(idH)}backups/`)).filter((p) => /allotr-\d{4}-\d{2}-\d{2}\.json$/.test(p));
  c('after ten days there are seven dated copies', (await datedNow()).length === 7, String((await datedNow()).length));
  await H.page.evaluate(
    ([id]) => {
      window.__days = 10;
      const now = Date.now();
      const f = (path, ageMs) => ({ path, data: '{}', mtime: now - ageMs });
      window.harness.loadFiles(
        [
          f(`Allotr/devices/${id}/latest.json.tmp`, 2 * 3600000),
          f(`Allotr/devices/${id}/backups/allotr-2020-01-01.json.tmp`, 3 * 3600000),
          f(`Allotr/devices/${id}/backups/allotr-fresh.json.tmp`, 600000),
          f(`Allotr/devices/${id}/backups/allotr-before-new-data.json`, 8 * 86400000),
          f('Allotr/devices/other/latest.json.tmp', 5 * 86400000),
        ],
        false,
      );
    },
    [idH],
  );
  await post(H.page, '/v1/accounts', { name: 'Day 10', currency: 'EUR', openingBalance: { amountMinor: 10, currency: 'EUR' } });
  await H.page.evaluate(() => window.plugin.backup.writeNow());
  const left = await files(H.page, 'Allotr/');
  c('a stale temp file of this device is removed', !left.includes(`${own(idH)}latest.json.tmp`) && !left.includes(`${own(idH)}backups/allotr-2020-01-01.json.tmp`));
  c('a recent temp file is kept', left.includes(`${own(idH)}backups/allotr-fresh.json.tmp`));
  c('an old "before new data" copy is removed', !left.includes(`${own(idH)}backups/allotr-before-new-data.json`));
  c('another device\'s files are never touched', left.includes('Allotr/devices/other/latest.json.tmp'));
  c('still seven dated copies', (await datedNow()).length === 7, String((await datedNow()).length));
  c('nothing was written to the vault root', (await vaultRootFiles(H.page)).length === 0);
  await H.context.close();
}

for (const [name, engine] of Object.entries(engines)) {
  if (which !== 'all' && which !== name) continue;
  const browser = await engine.launch();
  try {
    if (part !== 'quiet') await run(name, browser);
    await quiet(name, browser);
  } catch (error) {
    check(name, 'scenario', false, String(error));
    if (process.env.DEBUG)
      for (const [vault, page] of openPages)
        console.log(vault, page.logs.slice(-12), await accountNames(page).catch(String), await page.evaluate(() => [document.querySelectorAll('.modal-container').length, window.plugin.backup.isHeld, window.harness.state.notices.slice(-3)]).catch(String));
  } finally {
    await browser.close();
  }
}
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
