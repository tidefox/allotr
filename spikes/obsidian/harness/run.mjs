// Drives the built plugin in Chromium and WebKit through a fake Obsidian.
//   node harness/run.mjs [chromium|webkit|all] [--no-seed]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { engines, newHarnessPage, ORIGIN, shotDir, startPlugin } from './lib.mjs';

const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
const skipSeed = process.argv.includes('--no-seed');
mkdirSync(shotDir, { recursive: true });
const results = [];
let failures = 0;

function check(engine, tag, name, ok, detail = '') {
  results.push({ engine, tag, name, ok: Boolean(ok), detail: String(detail) });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${engine} ${tag}] ${name}${detail ? ` -- ${detail}` : ''}`);
}

const leftToday = (page) =>
  page.evaluate(() => {
    const text = document.querySelector('.allotr-host')?.shadowRoot?.textContent ?? '';
    const m = /left today\s*(-?\$[\d,.]+)/.exec(text);
    return m ? m[1] : null;
  });

async function openAllotr(page) {
  await page.evaluate(() => window.harness.clickRibbon());
  await page.waitForSelector('.allotr-host', { timeout: 20000 });
  await page.getByText('left today').first().waitFor({ timeout: 20000 });
}

async function scenario(engine, browser, { tag, viewport, platform, seed, nodeLike }) {
  const requests = [];
  const query = `?platform=${platform}`;
  const { context, page } = await newHarnessPage(browser, { viewport, query, requests });
  if (nodeLike)
    await page.addInitScript(() => {
      // What Obsidian desktop (Electron) exposes and mobile does not.
      window.process = { versions: { node: '22.0.0', electron: '30.0.0' }, type: 'renderer', env: {}, platform: 'darwin' };
      window.require = () => { throw new Error('require is not for plugins in this test'); };
    }).then(() => page.reload());
  const c = (name, ok, detail) => check(engine, tag, name, ok, detail);
  const shot = (name) => page.screenshot({ path: join(shotDir, `${engine}-${tag}-${name}.png`) });

  await startPlugin(page);
  await openAllotr(page);

  // --- rendering inside the shadow root
  const facts = await page.evaluate(() => {
    const host = document.querySelector('.allotr-host');
    const sr = host.shadowRoot;
    const wrapper = sr.querySelector('.ar');
    const frame = sr.querySelector('.frame');
    const cs = frame && getComputedStyle(frame);
    const seam = [...sr.querySelectorAll('*')].find((e) => getComputedStyle(e).borderTopWidth !== '0px' && getComputedStyle(e).borderTopStyle === 'solid');
    return {
      hasShadow: Boolean(sr),
      wrapperTheme: wrapper?.dataset.theme,
      rootTheme: document.documentElement.dataset.theme ?? null,
      rootStyleAttr: document.documentElement.getAttribute('style'),
      bg: wrapper && getComputedStyle(wrapper).backgroundColor,
      seamFound: Boolean(seam),
      containerType: cs && cs.containerType,
      fontOk: document.fonts.check('12px "Allotr Geist Mono Variable"'),
      fontFaces: [...document.fonts].filter((f) => f.family.includes('Allotr')).map((f) => f.status).join(','),
      outerHasApp: Boolean(document.querySelector('.frame')),
      bodyChildren: document.body.children.length,
    };
  });
  c('app renders inside a shadow root', facts.hasShadow && !facts.outerHasApp);
  c('theme attributes stay off the page <html>', facts.rootTheme === null && facts.rootStyleAttr === null, `theme=${facts.rootTheme} style=${facts.rootStyleAttr}`);
  c('wrapper carries data-theme', facts.wrapperTheme === 'light', facts.wrapperTheme);
  c('borders resolve (@property hoisted)', facts.seamFound);
  c('container queries on the frame', facts.containerType === 'inline-size', facts.containerType);
  c('font faces in document.head load', facts.fontOk, facts.fontFaces);
  await shot('01-setup');

  // --- first run: setup through the UI, then an account
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Everyday');
  await page.getByRole('textbox', { name: /Opening balance/ }).fill('2500');
  await page.getByRole('button', { name: 'Add account' }).click();
  await page.getByRole('button', { name: /Skip the rest of setup/ }).click();
  await page.getByText(/^dashboard$/).first().waitFor();
  await page.waitForTimeout(800);
  const before = await leftToday(page);
  c('first-run setup works; account created', before !== null && before !== '$0.00', `left today ${before}`);
  await shot('02-dashboard');

  // --- a menu opens inside the shadow root
  await page.getByRole('button', { name: /^new$/i }).click();
  await page.getByRole('menu').waitFor();
  const menuWhere = await page.evaluate(() => ({
    inShadow: Boolean(document.querySelector('.allotr-host').shadowRoot.querySelector('[role=menu]')),
    inPortal: Boolean(document.querySelector('.allotr-host').shadowRoot.querySelector('.ar-portals [role=menu]')),
    inLight: Boolean(document.querySelector('[role=menu]')),
    rect: (() => { const m = document.querySelector('.allotr-host').shadowRoot.querySelector('[role=menu]').getBoundingClientRect(); return [Math.round(m.x), Math.round(m.y), Math.round(m.width), Math.round(m.height)]; })(),
  }));
  c('menu opens in the shadow portal container', menuWhere.inShadow && menuWhere.inPortal && !menuWhere.inLight, JSON.stringify(menuWhere));
  await shot('03-menu');
  await page.keyboard.press('Escape');
  await page.getByRole('menu').waitFor({ state: 'detached' }).catch(() => undefined);

  // --- add an entry through the command line; keyboard stays inside the view
  const input = page.getByRole('textbox', { name: 'Command line' });
  await input.click();
  await page.evaluate(() => { window.harness.state.hotkeyHits.length = 0; });
  await input.pressSequentially('-8.40 lunch f/,', { delay: 10 });
  const typed = await input.inputValue();
  const leaked = await page.evaluate(() => window.harness.state.hotkeyHits.length);
  c('typing in the view does not reach Obsidian hotkeys', leaked === 0 && typed.endsWith('f/,'), `leaked=${leaked} value=${typed}`);
  await input.fill('');
  // An expense through the + new form (the command line is not wired up yet).
  await page.getByRole('button', { name: /^new$/i }).click();
  await page.getByRole('menuitem', { name: 'Expense' }).click();
  const dialog = page.getByRole('dialog', { name: 'Expense' });
  await dialog.waitFor();
  await dialog.getByRole('textbox', { name: /Amount/ }).fill('12.50');
  await dialog.getByRole('button', { name: /Category/ }).first().click();
  await page.getByRole('menuitemradio').first().click();
  await page.getByRole('menu').waitFor({ state: 'detached' });
  await dialog.getByRole('button', { name: /^Save$/ }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForTimeout(1200);
  const after = await leftToday(page);
  c('adding an entry changes "left today"', after !== null && after !== before, `${before} -> ${after}`);
  await shot('04-after-entry');
  // Unmodified keys outside inputs do not leak; Ctrl/Cmd chords still do.
  await page.getByRole('button', { name: /^new$/i }).focus();
  await page.evaluate(() => { window.harness.state.hotkeyHits.length = 0; });
  await page.keyboard.press('Control+KeyP');
  const chord = await page.evaluate(() => window.harness.state.hotkeyHits.length);
  c('modified chords outside inputs still reach Obsidian', chord >= 1, `hits=${chord}`);

  // --- dark mode follows body.theme-dark
  await page.evaluate(() => { document.body.classList.replace('theme-light', 'theme-dark'); });
  await page.waitForTimeout(300);
  const dark = await page.evaluate(() => {
    const w = document.querySelector('.allotr-host').shadowRoot.querySelector('.ar');
    return { theme: w.dataset.theme, bg: getComputedStyle(w).backgroundColor, canvas: getComputedStyle(w).getPropertyValue('--canvas').trim() };
  });
  c('follows Obsidian dark theme', dark.theme === 'dark' && dark.bg !== facts.bg, JSON.stringify(dark));
  await shot('05-dark');
  await page.evaluate(() => { document.body.classList.replace('theme-dark', 'theme-light'); });

  // --- a second leaf shares the runtime
  const shared = await page.evaluate(async () => {
    const p = window.plugin;
    const rt = await p.getRuntime();
    const leaf = p.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: 'allotr-view', active: true });
    await new Promise((r) => setTimeout(r, 1500));
    const hosts = document.querySelectorAll('.allotr-host').length;
    const same = (await p.getRuntime()) === rt;
    const qc = rt.shared.queryClient !== undefined;
    await leaf.detach();
    return { hosts, same, qc, views: p.views.size };
  });
  c('several leaves share one runtime', shared.hosts === 2 && shared.same && shared.qc && shared.views === 1, JSON.stringify(shared));

  // --- persistence: the debounced save (no manual flush), then reload
  await page.waitForTimeout(2500);
  const autoSaved = await page.evaluate(() => window.plugin.runtime.timings.lastSaveMs);
  const savedBefore = undefined;
  c('debounced save ran by itself after the write', autoSaved !== undefined, `lastSaveMs=${autoSaved}`);
  const saved = await page.evaluate(() => ({ ms: window.plugin.runtime.timings.lastSaveMs, bytes: window.plugin.runtime.timings.lastSaveBytes }));
  c('saved to IndexedDB', saved.bytes > 100000, JSON.stringify(saved));
  await page.reload();
  await startPlugin(page);
  await openAllotr(page);
  await page.waitForTimeout(800);
  const reloaded = await leftToday(page);
  const onSetup = (await page.getByText(/Step \d of 5/).count()) > 0;
  c('reload keeps the data', reloaded === after && !onSetup, `${after} -> ${reloaded}, setupShown=${onSetup}`);
  const timings = await page.evaluate(() => window.plugin.runtime.timings);
  c('opened from the stored blob', timings.openFromBlobMs !== undefined && timings.migrationsApplied === 0, JSON.stringify(timings));
  await shot('06-after-reload');

  // --- diagnostics
  await page.evaluate(() => window.harness.runCommand('Allotr: Diagnostics'));
  await page.getByText('Allotr spike S1 report').waitFor();
  let report = await page.locator('.allotr-diagnostics-output').textContent();
  c('diagnostics show platform, features and timings', /isDesktopApp=|isIosApp=/.test(report) && /WebAssembly: yes/.test(report) && /migrations:/.test(report) && /View Transitions:/.test(report), report.split('\n').slice(5, 9).join(' | '));
  await shot('07-diagnostics');
  if (seed) {
    await page.getByRole('button', { name: 'Seed 5k' }).click();
    await page.waitForFunction(() => /5000 rows/.test(document.querySelector('.allotr-diagnostics-output')?.textContent ?? ''), null, { timeout: 240000 });
    report = await page.locator('.allotr-diagnostics-output').textContent();
    const seedLine = report.split('\n').filter((l) => /5000 rows|cold|warm/.test(l)).join(' | ');
    c('5k seed benchmark completes', /5000 rows: build/.test(report) && /status 200/.test(report), seedLine);
    const stillMine = await leftToday(page);
    c('seeding did not touch the real database', stillMine === after, `${stillMine}`);
    await shot('08-diagnostics-5k');
  }
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  await page.getByRole('button', { name: 'Copy report' }).click();
  await page.waitForTimeout(300);
  const notices = await page.evaluate(() => window.harness.state.notices.slice());
  c('copy report gives feedback', notices.some((n) => /copied|copy it by hand/i.test(n)), notices.join(' | '));
  writeFileSync(join(shotDir, `..`, `report-${engine}-${tag}.md`), report);
  await page.evaluate(() => document.querySelector('.modal-container')?.remove());

  // --- lifecycle
  await page.evaluate(async () => { await window.harness.unloadPlugin(window.plugin); });
  await page.waitForTimeout(300);
  const gone = await page.evaluate(() => ({
    hosts: document.querySelectorAll('.allotr-host').length,
    fonts: Boolean(document.getElementById('allotr-spike-fonts')),
    props: Boolean(document.getElementById('allotr-spike-properties')),
    marker: Boolean(document.getElementById('react-aria-pressable-style')),
  }));
  c('unload removes view and injected head styles', gone.hosts === 0 && !gone.fonts && !gone.props && !gone.marker, JSON.stringify(gone));
  await startPlugin(page);
  await openAllotr(page);
  c('plugin can be re-enabled after unload', (await leftToday(page)) === after);

  // --- network
  const external = requests.filter((u) => {
    if (u.startsWith('data:') || u.startsWith('blob:')) return false;
    return !u.startsWith(`${ORIGIN}/`);
  });
  const apiOnNetwork = requests.filter((u) => /\/v1\//.test(u));
  c('no request leaves the page (only harness files)', external.length === 0 && apiOnNetwork.length === 0, `external=${external.slice(0, 3)} api=${apiOnNetwork.slice(0, 3)}`);
  const errors = page.logs.filter((l) => /^(pageerror|error)/.test(l));
  c('no console errors or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

const engineNames = which === 'all' ? ['chromium', 'webkit'] : [which];
for (const engine of engineNames) {
  const browser = await engines[engine].launch();
  console.log(`--- ${engine} ${browser.version()}`);
  const safe = async (opts) => { try { await scenario(engine, browser, opts); } catch (error) { check(engine, opts.tag, 'scenario ran to the end', false, String(error).split('\n')[0]); } };
  await safe({ tag: 'desktop', viewport: { width: 1280, height: 800 }, platform: 'desktop', seed: !skipSeed, nodeLike: false });
  await safe({ tag: 'desktop-node', viewport: { width: 1000, height: 700 }, platform: 'desktop', seed: false, nodeLike: true });
  await safe({ tag: 'phone', viewport: { width: 390, height: 844 }, platform: 'ios', seed: false, nodeLike: false });
  await browser.close();
}
writeFileSync(resolve(shotDir, '../harness-results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
