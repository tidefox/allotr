// Builds the Obsidian plugin: one CommonJS main.js (obsidian external,
// everything else bundled; wasm, fonts and CSS inlined) plus manifest.json.
//   node build.mjs [--skip-web]   (--skip-web reuses gen/webdist)
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';

const here = import.meta.dirname;
const root = resolve(here, '../..');
const out = resolve(root, 'docs/drafts/obsidian/build/allotr');
const gen = join(here, 'gen');
const webDist = join(gen, 'webdist');
mkdirSync(gen, { recursive: true });

// 1. The web app's CSS, built by its own Vite + Tailwind pipeline.
if (!process.argv.includes('--skip-web')) {
  execFileSync('npx', ['vite', 'build', '--outDir', '../../spikes/obsidian/gen/webdist', '--emptyOutDir'], {
    cwd: join(root, 'apps/web'), stdio: 'inherit',
  });
}
const assets = join(webDist, 'assets');
const cssFile = readdirSync(assets).find((f) => f.endsWith('.css'));
if (cssFile === undefined) throw new Error('no CSS in the web build');
let css = readFileSync(join(assets, cssFile), 'utf8');

// 2. Fonts: only the Latin faces (and the mono symbols) are inlined, under
// Allotr's own family names; they go to document.head at runtime.
const keepFont = /(?:^|-)(?:latin|latin-ext|symbols2)-wght-normal/;
const fontFaces = [...css.matchAll(/@font-face\{[^}]*\}/g)].map((m) => m[0]);
css = css.replace(/@font-face\{[^}]*\}\s*/g, '');
const fontCss = fontFaces
  .filter((face) => keepFont.test(face))
  .map((face) =>
    face.replace(/url\(([^)]+)\)/, (_m, url) => {
      const file = join(webDist, url.replace(/^\//, ''));
      return `url(data:font/woff2;base64,${readFileSync(file).toString('base64')})`;
    }),
  )
  .join('\n')
  .replaceAll('Geist Mono Variable', 'Allotr Geist Mono Variable')
  .replaceAll('Geist Variable', 'Allotr Geist Variable');
css = css.replaceAll('Geist Mono Variable', 'Allotr Geist Mono Variable').replaceAll('Geist Variable', 'Allotr Geist Variable');

// 3. @property rules are ignored in shadow roots: hoist them to document.head.
const properties = [...css.matchAll(/@property\s+--[a-z0-9-]+\{[^}]*\}/g)].map((m) => m[0]);
css = css.replace(/@property\s+--[a-z0-9-]+\{[^}]*\}/g, '');

// 4. Selectors: there is no <html>/<body>/:root inside a shadow root. The
// wrapper `.ar` plays all three (it carries data-theme etc.), and `:host`
// keeps the inherited defaults. Viewport units become the leaf's size.
const before = css.length;
css = css
  .replaceAll('html,:host{', ':host,.ar{')
  .replaceAll(':root,:host{', '.ar,:host{')
  .replaceAll('html::-webkit-scrollbar', '.ar::-webkit-scrollbar')
  .replace(/(^|[},])html\{/g, '$1.ar{')
  .replace(/(^|[},])body\{/g, '$1.ar{')
  .replace(/:root\b/g, '.ar')
  .replace(/(\d+(?:\.\d+)?)dvh/g, '$1%');
const leftovers = css.match(/(?:^|[},\s])(?:html|body)(?=[\s,{:\[])|:root/g);
if (leftovers) throw new Error(`unrewritten selectors: ${[...new Set(leftovers)].join(' | ')}`);
writeFileSync(
  join(gen, 'css.json'),
  JSON.stringify({ appCss: css, fontCss, propertyCss: properties.join('\n') }),
);
console.log(`css: ${before} -> ${css.length} bytes, fonts ${fontCss.length}, @property rules ${properties.length}`);

// 5. Migrations, unchanged, as strings.
const migrationFiles = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const migrationData = migrationFiles.map((name) => ({ name, sql: readFileSync(join(root, 'migrations', name), 'utf8') }));

const require = createRequire(import.meta.url);
const racDir = dirname(require.resolve('react-aria-components/package.json', { paths: [join(root, 'apps/web')] }));
// react-aria's umbrella entry is huge; PortalProvider has its own ESM file, and
// it is the same module instance react-aria-components' overlays read.
const reactAria = join(dirname(require.resolve('react-aria/package.json', { paths: [racDir] })), 'dist/exports/PortalProvider.mjs');
const wasmBase64 = readFileSync(join(here, 'node_modules/sql.js/dist/sql-wasm-browser.wasm')).toString('base64');

// react-aria has opt-in shadow DOM support (ariaHideOutside, FocusScope, ...):
// without it a modal popover marks the whole <body> inert, which locks focus
// out of the popover (and would lock Obsidian's own UI).
const shadowFlag = join(dirname(require.resolve('react-stately/package.json', { paths: [racDir] })), 'dist/private/flags/flags.mjs');

// 6. Node built-ins that survive in the server's import graph are replaced
// by stubs that throw when used; the build lists them so they can be audited.
const nodeUsers = new Map();
const STATUS = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 413: 'Payload Too Large', 415: 'Unsupported Media Type', 422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };
const stubFor = (name) => `
const unavailable = (what) => function () { throw new Error('${name}.' + String(what) + ' is not available in the Obsidian plugin'); };
const overrides = {
  randomUUID: () => globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, (c) => (c ^ (globalThis.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)),
  STATUS_CODES: ${JSON.stringify(STATUS)},
};
module.exports = new Proxy({ ...overrides }, {
  get: (_t, key) => key === '__esModule' ? false : key === 'default' ? module.exports : ${name === 'node:crypto' ? '(key in overrides ? overrides[key] : unavailable(key))' : name === 'node:http' ? '(key in overrides ? overrides[key] : unavailable(key))' : 'unavailable(key)'},
});`;

const serverAliases = [
  [/[\\/]auth[\\/]auth\.ts$/, 'shims/auth.ts'],
  [/[\\/]http[\\/]entry-client\.ts$/, 'shims/entry-client.ts'],
  [/[\\/]http[\\/]web\.ts$/, 'shims/web.ts'],
  [/[\\/]http[\\/]client-ip\.ts$/, 'shims/client-ip.ts'],
  [/[\\/]push[\\/]delivery\.ts$/, 'shims/push-delivery.ts'],
  [/[\\/]src[\\/]theme-url\.ts$/, 'shims/theme-url.ts'],
];

const plugin = {
  name: 'allotr-spike',
  setup(b) {
    b.onResolve({ filter: /^node:/ }, (a) => {
      nodeUsers.set(a.path, [...(nodeUsers.get(a.path) ?? []), a.importer.replace(root, '')]);
      return { path: a.path, namespace: 'node-stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'node-stub' }, (a) => ({ contents: stubFor(a.path), loader: 'js' }));
    b.onResolve({ filter: /^better-auth\/api$/ }, () => ({ path: join(here, 'shims/better-auth-api.ts') }));
    b.onResolve({ filter: /^@hono\/node-server\/conninfo$/ }, () => ({ path: join(here, 'shims/conninfo.ts') }));
    b.onResolve({ filter: /^allotr:shadow-flag$/ }, () => ({ path: shadowFlag }));
    b.onResolve({ filter: /^react-aria$/ }, () => ({ path: reactAria }));
    b.onResolve({ filter: /[\\/](?:auth|entry-client|web|client-ip|delivery|theme-url)\.ts$/ }, (a) => {
      if (!a.importer.includes('/apps/server/src/') || !a.path.startsWith('.')) return undefined;
      const full = resolve(dirname(a.importer), a.path);
      for (const [re, shim] of serverAliases) if (re.test(full)) return { path: join(here, shim) };
      return undefined;
    });
    b.onResolve({ filter: /^virtual:/ }, (a) => ({ path: a.path, namespace: 'virtual' }));
    b.onLoad({ filter: /^virtual:wasm$/, namespace: 'virtual' }, () => ({
      contents: `export default ${JSON.stringify(wasmBase64)};`, loader: 'js',
    }));
    b.onLoad({ filter: /^virtual:migrations$/, namespace: 'virtual' }, () => ({
      contents: `export const migrations = ${JSON.stringify(migrationData)};`, loader: 'js',
    }));
    b.onLoad({ filter: /^virtual:css$/, namespace: 'virtual' }, () => {
      const c = JSON.parse(readFileSync(join(gen, 'css.json'), 'utf8'));
      return {
        contents: `export const appCss = ${JSON.stringify(c.appCss)};\nexport const fontCss = ${JSON.stringify(c.fontCss)};\nexport const propertyCss = ${JSON.stringify(c.propertyCss)};`,
        loader: 'js',
      };
    });
  },
};

const mainJs = join(here, 'dist/main.js');
const note = `built ${new Date().toISOString().slice(0, 16)}Z`;
const result = await build({
  entryPoints: [join(here, 'src/main.ts')],
  outfile: mainJs,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  external: ['obsidian'],
  minify: !process.argv.includes('--no-minify'),
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
  nodePaths: [join(root, 'apps/web/node_modules'), join(root, 'apps/server/node_modules'), join(here, 'node_modules')],
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"production"',
    __BUNDLE_NOTE__: JSON.stringify(note),
  },
  plugins: [plugin],
});
writeFileSync(join(here, 'dist/meta.json'), JSON.stringify(result.metafile));

// 7. Audit: no Node built-ins, no network URLs the code would fetch.
let js = readFileSync(mainJs, 'utf8');
const requires = [...new Set([...js.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]))];
const badRequires = requires.filter((r) => r !== 'obsidian');
const urls = [...new Set([...js.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]))];
console.log('require() targets:', requires, 'bad:', badRequires);
console.log('node: stubs and who pulled them:');
for (const [name, who] of nodeUsers) console.log('  ', name, '<-', [...new Set(who)].join(', '));
writeFileSync(join(here, 'dist/audit.json'), JSON.stringify({ requires, urls, nodeStubs: Object.fromEntries(nodeUsers) }, null, 2));
if (badRequires.length > 0) throw new Error(`unexpected require(): ${badRequires.join(', ')}`);

// 8. Output folder.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(mainJs, join(out, 'main.js'));
writeFileSync(
  join(out, 'manifest.json'),
  JSON.stringify({
    id: 'allotr', name: 'Allotr', version: '0.0.1-spike.3', minAppVersion: '1.5.0',
    description: 'Spike S1: the Allotr budget app running inside Obsidian. Not for real data.',
    author: 'Allotr contributors', isDesktopOnly: false,
  }, null, 2) + '\n',
);
const raw = readFileSync(join(out, 'main.js'));
const sizes = { raw: raw.length, gzip: gzipSync(raw).length, wasmRaw: Buffer.from(wasmBase64, 'base64').length, appCss: css.length, fontCss: fontCss.length };
writeFileSync(join(here, 'dist/sizes.json'), JSON.stringify(sizes, null, 2));
console.log(sizes);
