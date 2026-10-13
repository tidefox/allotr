// Spike S1 diagnostics: platform, feature checks, timings, synthetic-data
// benchmarks, and a Markdown report the maintainer can paste back.
import type { App } from 'obsidian';
import * as obsidian from 'obsidian';
import { Platform } from 'obsidian';
import { noBlobStore, type BlobStore } from './blob-store.ts';
import { Runtime, type Timings } from './runtime.ts';
import { seedSynthetic } from './seed.ts';

export interface SeedResult {
  rows: number;
  seedMs: number;
  dbBytes: number;
  exportMs: number;
  openFromBlobMs: number;
  coldTodayMs: number;
  warmTodayMs: number[];
  coldReportMs: number;
  warmReportMs: number;
  todayStatus: number;
  memBeforeMb: number | null;
  memAfterMb: number | null;
  error?: string;
}

interface PerfMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;

export function memorySnapshot(): PerfMemory | null {
  const memory = (performance as unknown as { memory?: PerfMemory }).memory;
  return memory === undefined ? null : memory;
}

function fmt(value: number | undefined, unit = ' ms'): string {
  return value === undefined ? 'n/a' : `${Math.round(value * 10) / 10}${unit}`;
}

export function featureChecks(): Record<string, string> {
  const yes = (ok: boolean) => (ok ? 'yes' : 'NO');
  return {
    WebAssembly: yes(typeof WebAssembly === 'object'),
    'crypto.randomUUID': yes(typeof crypto?.randomUUID === 'function'),
    'crypto.subtle': yes(typeof crypto?.subtle === 'object'),
    IndexedDB: yes(typeof indexedDB === 'object'),
    'View Transitions': yes(typeof (document as { startViewTransition?: unknown }).startViewTransition === 'function'),
    ResizeObserver: yes(typeof ResizeObserver === 'function'),
    structuredClone: yes(typeof structuredClone === 'function'),
    'Shadow DOM': yes(typeof Element.prototype.attachShadow === 'function'),
    'CSS container queries': yes(typeof CSS !== 'undefined' && CSS.supports('container-type: inline-size')),
    'CSS @property': yes(typeof CSS !== 'undefined' && 'registerProperty' in CSS),
    'isSecureContext': yes(window.isSecureContext),
    'navigator.storage.persist': yes(typeof navigator.storage?.persist === 'function'),
  };
}

export async function storageEstimate(): Promise<string> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate === undefined) return 'n/a';
    return `${mb(estimate.usage ?? 0)} MB used of ${mb(estimate.quota ?? 0)} MB quota`;
  } catch {
    return 'n/a';
  }
}

export interface Env {
  platform: string;
  userAgent: string;
  obsidianVersion: string;
  vault: string;
  language: string;
  dpr: number;
  viewport: string;
}

export function environment(app: App, vaultKey: string): Env {
  const platform = [
    `isDesktopApp=${Platform.isDesktopApp}`,
    `isMobileApp=${Platform.isMobileApp}`,
    `isIosApp=${Platform.isIosApp}`,
    `isAndroidApp=${Platform.isAndroidApp}`,
    `isPhone=${Platform.isPhone}`,
    `isTablet=${Platform.isTablet}`,
  ].join(', ');
  const version = (obsidian as unknown as { apiVersion?: string }).apiVersion ?? 'unknown';
  return {
    platform,
    userAgent: navigator.userAgent,
    obsidianVersion: version,
    vault: vaultKey,
    language: navigator.language,
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
  void app;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;

/** Seeds a throwaway database and times the figures on it. */
export async function seedBenchmark(
  rows: number,
  onProgress: (text: string) => void,
): Promise<SeedResult> {
  const before = memorySnapshot();
  const result: SeedResult = {
    rows,
    seedMs: 0,
    dbBytes: 0,
    exportMs: 0,
    openFromBlobMs: 0,
    coldTodayMs: 0,
    warmTodayMs: [],
    coldReportMs: 0,
    warmReportMs: 0,
    todayStatus: 0,
    memBeforeMb: before === null ? null : mb(before.usedJSHeapSize),
    memAfterMb: null,
  };
  let first: Runtime | undefined;
  let second: Runtime | undefined;
  try {
    onProgress(`building ${rows} rows...`);
    first = await Runtime.openThrowaway();
    const seeded = await seedSynthetic(first.db, rows, (done) => onProgress(`seeding ${done}/${rows}`));
    result.seedMs = seeded.ms;
    onProgress('exporting...');
    const e0 = performance.now();
    const blob = first.exportBytes();
    result.exportMs = performance.now() - e0;
    result.dbBytes = blob.length;
    first.discard();
    first = undefined;
    // Reopen from the blob like a real start, then time the figures.
    const store: BlobStore = { ...noBlobStore, load: () => Promise.resolve(blob) };
    onProgress('reopening from blob...');
    second = await Runtime.open({ store });
    result.openFromBlobMs = second.timings.openFromBlobMs ?? 0;
    onProgress('timing /v1/today...');
    const cold = await second.get('/v1/today');
    result.coldTodayMs = cold.ms;
    result.todayStatus = cold.status;
    for (let i = 0; i < 3; i++) result.warmTodayMs.push((await second.get('/v1/today')).ms);
    result.coldReportMs = (await second.get('/v1/reports/categories?period=month')).ms;
    result.warmReportMs = (await second.get('/v1/reports/categories?period=month')).ms;
  } catch (error) {
    result.error = String(error);
  } finally {
    first?.discard();
    second?.discard();
    const after = memorySnapshot();
    result.memAfterMb = after === null ? null : mb(after.usedJSHeapSize);
  }
  return result;
}

export function formatSeedResult(r: SeedResult): string[] {
  if (r.error !== undefined) return [`- ${r.rows} rows: FAILED ${r.error}`];
  return [
    `- ${r.rows} rows: build ${fmt(r.seedMs)}, DB ${mb(r.dbBytes)} MB, export ${fmt(r.exportMs)}, open from blob ${fmt(r.openFromBlobMs)}`,
    `  - /v1/today cold ${fmt(r.coldTodayMs)} (status ${r.todayStatus}), warm ${r.warmTodayMs.map((x) => fmt(x, '')).join(' / ')} ms (median ${fmt(median(r.warmTodayMs))})`,
    `  - /v1/reports/categories cold ${fmt(r.coldReportMs)}, warm ${fmt(r.warmReportMs)}`,
    `  - JS heap used: ${r.memBeforeMb ?? 'n/a'} -> ${r.memAfterMb ?? 'n/a'} MB (wasm memory is not included)`,
  ];
}

export async function buildReport(options: {
  env: Env;
  runtime: Runtime | null;
  seeds: readonly SeedResult[];
  pluginVersion: string;
  bundleNote: string;
}): Promise<string> {
  const { env, runtime, seeds } = options;
  const lines: string[] = [];
  lines.push(`# Allotr spike S1 report`);
  lines.push('');
  lines.push(`Plugin ${options.pluginVersion} (${options.bundleNote}), ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Platform');
  lines.push(`- ${env.platform}`);
  lines.push(`- Obsidian API version: ${env.obsidianVersion}`);
  lines.push(`- User agent: ${env.userAgent}`);
  lines.push(`- Language ${env.language}, DPR ${env.dpr}, viewport ${env.viewport}`);
  lines.push(`- Vault key: ${env.vault}`);
  lines.push('');
  lines.push('## Features');
  for (const [name, value] of Object.entries(featureChecks())) lines.push(`- ${name}: ${value}`);
  lines.push(`- Storage: ${await storageEstimate()}`);
  lines.push('');
  lines.push('## Timings (this vault)');
  if (runtime === null) lines.push('- runtime not started (open the Allotr view first)');
  else {
    const t: Timings = runtime.timings;
    lines.push(`- wasm load: ${fmt(t.wasmMs)}`);
    lines.push(`- IndexedDB read of blob: ${fmt(t.blobReadMs)}`);
    lines.push(`- DB open from blob: ${fmt(t.openFromBlobMs)}`);
    lines.push(`- migrations: ${fmt(t.migrationsMs)} (${t.migrationsApplied ?? 0} applied)`);
    lines.push(`- build app + local user: ${fmt(t.buildAppMs)}`);
    lines.push(`- /v1/today first: ${fmt(t.firstTodayMs)}, warm: ${fmt(t.warmTodayMs)}`);
    lines.push(`- last save: export ${fmt(t.lastExportMs)}, total ${fmt(t.lastSaveMs)}, ${mb(t.lastSaveBytes ?? 0)} MB`);
    lines.push(`- DB size (last saved/loaded): ${mb(runtime.dbBytes)} MB`);
    if (runtime.lastError !== null) lines.push(`- last error: ${runtime.lastError}`);
  }
  const memory = memorySnapshot();
  lines.push(
    memory === null
      ? '- performance.memory: not available'
      : `- performance.memory: used ${mb(memory.usedJSHeapSize)} MB, total ${mb(memory.totalJSHeapSize)} MB, limit ${mb(memory.jsHeapSizeLimit)} MB`,
  );
  lines.push('');
  lines.push('## Synthetic benchmarks (throwaway databases)');
  if (seeds.length === 0) lines.push('- not run');
  for (const seed of seeds) lines.push(...formatSeedResult(seed));
  lines.push('');
  return lines.join('\n');
}
