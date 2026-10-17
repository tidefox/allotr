// The vault is the durable copy of the ledger. The database itself lives in
// one device's IndexedDB, which can be cleared, evicted or lost, so after
// each save a JSON bundle is written to the vault.
//
// Every device writes only its own folder, so a sync tool never has two
// writers for one file:
//
//   Allotr/devices/<id>/latest.json      the newest bundle (a plain export)
//   Allotr/devices/<id>/device.json      who wrote it, when, and its hash
//   Allotr/devices/<id>/backups/         one dated copy per day (newest 30)
//
// `Allotr/allotr-latest.json` is the single shared file of earlier builds. It
// is still read (as a device called "legacy") but never written or deleted.
//
// Files are written to `<name>.tmp`, read back, then renamed, so a save that is
// cut short (the app suspended mid-write) leaves the previous file intact.
import { App, Modal, Platform } from 'obsidian';
import { exportBundle, ledgerSize, notice } from './migrate.ts';
import { localGet, localSet } from './local-store.ts';
import type { Runtime } from './runtime.ts';
import { sha256Hex } from './sha256.ts';

export const BACKUP_DIR = 'Allotr';
export const DEVICES_DIR = `${BACKUP_DIR}/devices`;
/** The single shared file written by builds before per-device snapshots. */
export const LEGACY_PATH = `${BACKUP_DIR}/allotr-latest.json`;
export const LEGACY_ID = 'legacy';
export const KEEP_DATED = 30;
const DATED_RE = /allotr-\d{4}-\d{2}-\d{2}\.json$/;
const DISMISSED_KEY = 'allotr-dismissed-divergence';

export interface DeviceIdentity {
  id: string;
  name: string;
}

export const deviceDir = (id: string): string => `${DEVICES_DIR}/${id}`;
export const latestPath = (id: string): string => `${deviceDir(id)}/latest.json`;
export const sidecarPath = (id: string): string => `${deviceDir(id)}/device.json`;
export const datedDir = (id: string): string => `${deviceDir(id)}/backups`;
/** Kept when a restore was declined and the first new write would replace the old latest. */
export const declinedPath = (id: string): string => `${datedDir(id)}/allotr-before-new-data.json`;

export function datedPath(id: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${datedDir(id)}/allotr-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** "Desktop 3fa9", "iPhone 3fa9": what the platform says, plus the start of the id. */
export function defaultDeviceName(id: string): string {
  const kind = Platform.isIosApp
    ? Platform.isTablet
      ? 'iPad'
      : 'iPhone'
    : Platform.isAndroidApp
      ? Platform.isTablet
        ? 'Android tablet'
        : 'Android phone'
      : Platform.isMobile
        ? 'Mobile'
        : 'Desktop';
  return `${kind} ${id.slice(0, 4)}`;
}

function localStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Written next to a device's `latest.json`. The bundle itself stays a plain export. */
export interface Sidecar {
  format: 'allotr.device';
  id: string;
  name: string;
  savedAt: number;
  sha256: string;
  accounts: number;
  entries: number;
  /**
   * Set after this device replaced its data with another device's snapshot:
   * that snapshot's hash, and the hash of this device's own export of it, so
   * the other device can tell this one holds nothing it has not seen.
   */
  basedOn?: { device: string; sha256: string; selfSha256?: string };
}

/** One device's newest readable snapshot. */
export interface Snapshot {
  deviceId: string;
  name: string;
  /** Milliseconds since the epoch, from the sidecar when it matches the file. */
  savedAt: number;
  sha256: string;
  accounts: number;
  entries: number;
  text: string;
  date: string;
  /** Read from a dated copy because the latest file was missing or damaged. */
  recovered: boolean;
  basedOn?: Sidecar['basedOn'];
}

/** Counts of a bundle, or null when the text is not an Allotr bundle (empty, cut short, other JSON). */
function parseBundle(text: string): { accounts: number; entries: number } | null {
  try {
    const bundle = JSON.parse(text) as { format?: unknown; accounts?: unknown[]; transactions?: unknown[] };
    if (bundle.format !== 'allotr.bundle') return null;
    return { accounts: bundle.accounts?.length ?? 0, entries: bundle.transactions?.length ?? 0 };
  } catch {
    return null;
  }
}

async function ensureDir(app: App, path: string): Promise<void> {
  const { adapter } = app.vault;
  let current = '';
  for (const part of path.split('/')) {
    current = current === '' ? part : `${current}/${part}`;
    if (!(await adapter.exists(current))) await adapter.mkdir(current);
  }
}

/**
 * Writes `<path>.tmp`, checks it reads back whole, then moves it over `path`.
 * The target is removed first because not every adapter's rename replaces a
 * file; the checked temp file is still there if the app stops in between, and
 * readers fall back to it.
 */
export async function atomicWrite(app: App, path: string, data: string): Promise<void> {
  const { adapter } = app.vault;
  const tmp = `${path}.tmp`;
  await adapter.write(tmp, data);
  let back: string;
  try {
    back = await adapter.read(tmp);
  } catch (error) {
    await adapter.remove(tmp).catch(() => undefined);
    throw error;
  }
  if (back !== data) {
    await adapter.remove(tmp).catch(() => undefined);
    throw new Error(`${path}: the file read back differently from what was written`);
  }
  if (await adapter.exists(path)) await adapter.remove(path);
  await adapter.rename(tmp, path);
}

async function readSidecar(app: App, id: string): Promise<Sidecar | null> {
  const { adapter } = app.vault;
  try {
    if (!(await adapter.exists(sidecarPath(id)))) return null;
    const side = JSON.parse(await adapter.read(sidecarPath(id))) as Partial<Sidecar>;
    if (side.format !== 'allotr.device' || typeof side.savedAt !== 'number' || typeof side.sha256 !== 'string')
      return null;
    return side as Sidecar;
  } catch {
    return null;
  }
}

async function tryRead(app: App, path: string): Promise<{ text: string; mtime: number } | null> {
  const { adapter } = app.vault;
  try {
    if (!(await adapter.exists(path))) return null;
    const text = await adapter.read(path);
    if (parseBundle(text) === null) return null;
    const stat = await adapter.stat(path);
    return { text, mtime: stat?.mtime ?? 0 };
  } catch {
    // Missing, unreadable, or a sync placeholder that is not downloaded yet.
    return null;
  }
}

/** A device's newest readable bundle: latest, then a finished temp file, then dated copies, newest first. */
async function readDevice(app: App, id: string): Promise<Snapshot | null> {
  const { adapter } = app.vault;
  const dated: string[] = [];
  try {
    if (await adapter.exists(datedDir(id)))
      dated.push(...(await adapter.list(datedDir(id))).files.filter((f) => DATED_RE.test(f)).sort().reverse());
  } catch {
    // no dated copies readable
  }
  const candidates = [latestPath(id), `${latestPath(id)}.tmp`, ...dated];
  const side = await readSidecar(app, id);
  for (const path of candidates) {
    const found = await tryRead(app, path);
    if (found === null) continue;
    const counts = parseBundle(found.text) as { accounts: number; entries: number };
    const sha256 = sha256Hex(found.text);
    // The sidecar describes latest.json only; for anything else, or when the
    // two were delivered out of step, the file's own modified time is used.
    const matches = side !== null && side.sha256 === sha256;
    const savedAt = matches ? side.savedAt : found.mtime;
    return {
      deviceId: id,
      name: side?.name ?? `Device ${id.slice(0, 4)}`,
      savedAt,
      sha256,
      ...counts,
      text: found.text,
      date: localStamp(new Date(savedAt)),
      recovered: path !== latestPath(id),
      ...(matches && side.basedOn !== undefined ? { basedOn: side.basedOn } : {}),
    };
  }
  return null;
}

/** Every device's newest snapshot (this device included), plus the legacy shared file. */
export async function readSnapshots(app: App): Promise<Snapshot[]> {
  const { adapter } = app.vault;
  const found: Snapshot[] = [];
  try {
    if (await adapter.exists(DEVICES_DIR)) {
      for (const folder of (await adapter.list(DEVICES_DIR)).folders) {
        const id = folder.split('/').pop() ?? '';
        if (id === '') continue;
        const snapshot = await readDevice(app, id);
        if (snapshot !== null) found.push(snapshot);
      }
    }
  } catch (error) {
    console.warn('[allotr] could not list device snapshots', error);
  }
  const legacy = await tryRead(app, LEGACY_PATH);
  if (legacy !== null) {
    const counts = parseBundle(legacy.text) as { accounts: number; entries: number };
    found.push({
      deviceId: LEGACY_ID,
      name: 'an earlier version (shared file)',
      savedAt: legacy.mtime,
      sha256: sha256Hex(legacy.text),
      ...counts,
      text: legacy.text,
      date: localStamp(new Date(legacy.mtime)),
      recovered: false,
    });
  }
  return found;
}

/** The newest snapshot of any device, or null when the vault has none. */
export async function readBest(app: App): Promise<Snapshot | null> {
  const all = await readSnapshots(app);
  return all.reduce<Snapshot | null>((best, s) => (best === null || s.savedAt > best.savedAt ? s : best), null);
}

function dismissedSet(app: App): Set<string> {
  try {
    return new Set(JSON.parse(localGet(app, DISMISSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** "Keep mine" / "I have seen these": this device is not asked about these snapshots again. */
export function dismiss(app: App, snapshots: Snapshot[]): void {
  const all = [...dismissedSet(app), ...snapshots.map((s) => `${s.deviceId}:${s.sha256}`)].slice(-200);
  localSet(app, DISMISSED_KEY, JSON.stringify(all));
}

export class VaultBackup {
  private runtime: Runtime | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private chain: Promise<void> = Promise.resolve();
  private lastHash: string | null = null;
  private lastDated = '';
  private warned = false;
  /** Set when a restore was offered and declined: the old latest is kept aside on the first write. */
  private preserveOld = false;
  /** While another device's newer data is undecided, nothing is written to the vault. */
  private held = false;
  private sidecar: Sidecar | null = null;
  private basedOn: Sidecar['basedOn'];
  private basedOnDirty = false;
  private loaded = false;
  /** The hash of this device's data at the last check. */
  myHash = '';

  constructor(
    private readonly app: App,
    private readonly identity: () => DeviceIdentity,
    private readonly debounceMs = 10_000,
  ) {}

  /** Reads this device's own sidecar. Call before anything can save. */
  async loadOwn(): Promise<void> {
    // Once per session: later opens (after an import) keep what this session has learned.
    if (this.loaded) return;
    this.loaded = true;
    const side = await readSidecar(this.app, this.identity().id);
    this.sidecar = side;
    this.basedOn = side?.basedOn;
  }

  attach(runtime: Runtime): void {
    this.detach();
    this.runtime = runtime;
    this.unsubscribe = runtime.onSaved(() => this.schedule());
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.runtime = null;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  keepOldLatest(): void {
    this.preserveOld = true;
  }

  /** Pauses (or resumes) vault writes while a decision about another device's data is open. */
  hold(on: boolean): void {
    this.held = on;
    if (!on) this.schedule();
  }

  get isHeld(): boolean {
    return this.held;
  }

  /** After this device replaced its data with `from`: the next write records where it came from. */
  replacedBy(from: Snapshot): void {
    this.basedOn = { device: from.deviceId, sha256: from.sha256 };
    this.basedOnDirty = true;
  }

  /** The hash of this device's own export right after it replaced its data (see `Sidecar.basedOn`). */
  derivedHash(selfSha256: string): void {
    if (this.basedOn === undefined) return;
    this.basedOn = { ...this.basedOn, selfSha256 };
    this.basedOnDirty = true;
  }

  schedule(): void {
    if (this.runtime === null || this.held) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.writeNow(), this.debounceMs);
  }

  /** Writes now if a write is pending (page hiding); never throws. */
  async flushPending(): Promise<void> {
    if (this.timer === undefined) return;
    await this.writeNow();
  }

  /** Waits for writes already started. */
  idle(): Promise<void> {
    return this.chain;
  }

  writeNow(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const runtime = this.runtime;
    if (runtime === null || this.held) return this.chain;
    this.chain = this.chain.then(() => this.write(runtime)).catch((error: unknown) => {
      console.warn('[allotr] vault backup failed', error);
      if (!this.warned) {
        this.warned = true;
        notice(`Allotr could not write its vault backup: ${String(error)}`, 15000);
      }
    });
    return this.chain;
  }

  /**
   * The snapshot of another device with changes this one has not seen, or null.
   * Not a matter of time (a device that stays open, or a file delivered late,
   * would hide real differences): a snapshot counts unless it is the same as
   * what this device holds, is the one this device was replaced from, was built
   * from exactly what this device holds, or was dismissed here. The newest one
   * is returned.
   */
  async newerElsewhere(runtime: Runtime): Promise<{ other: Snapshot; mine: { accounts: number; entries: number } } | null> {
    const me = this.identity().id;
    const mine = await ledgerSize(runtime);
    const myHash = sha256Hex(await exportBundle(runtime));
    this.myHash = myHash;
    const dismissed = dismissedSet(this.app);
    const candidates = (await readSnapshots(this.app)).filter(
      (s) =>
        s.deviceId !== me &&
        s.sha256 !== myHash &&
        s.sha256 !== this.basedOn?.sha256 &&
        !(s.basedOn?.sha256 === myHash && s.basedOn.selfSha256 === s.sha256) &&
        !dismissed.has(`${s.deviceId}:${s.sha256}`),
    );
    const newest = candidates.reduce<Snapshot | null>((best, s) => (best === null || s.savedAt > best.savedAt ? s : best), null);
    return newest === null ? null : { other: newest, mine };
  }

  private async write(runtime: Runtime): Promise<void> {
    const self = this.identity();
    // An empty ledger is never worth a backup, and must not replace a real one.
    const size = await ledgerSize(runtime);
    if (size.accounts === 0 && size.entries === 0) return;
    const text = await exportBundle(runtime);
    const hash = sha256Hex(text);
    const dated = datedPath(self.id);
    await ensureDir(this.app, datedDir(self.id));
    const { adapter } = this.app.vault;
    if (this.lastHash === null && (await adapter.exists(latestPath(self.id)))) {
      const old = await adapter.read(latestPath(self.id));
      if (old === text) this.lastHash = hash;
      else if (this.preserveOld && parseBundle(old) !== null) await atomicWrite(this.app, declinedPath(self.id), old);
      this.preserveOld = false;
    }
    let wrote = false;
    if (hash !== this.lastHash) {
      await atomicWrite(this.app, latestPath(self.id), text);
      this.lastHash = hash;
      wrote = true;
    }
    if (this.lastDated !== `${dated}\n${hash}`) {
      await atomicWrite(this.app, dated, text);
      this.lastDated = `${dated}\n${hash}`;
      await this.prune(self.id);
    }
    if (wrote || this.sidecar?.sha256 !== hash || this.basedOnDirty) {
      const side: Sidecar = {
        format: 'allotr.device',
        id: self.id,
        name: self.name,
        savedAt: wrote || this.sidecar === null ? Date.now() : this.sidecar.savedAt,
        sha256: hash,
        ...(parseBundle(text) ?? { accounts: size.accounts, entries: size.entries }),
        ...(this.basedOn === undefined ? {} : { basedOn: this.basedOn }),
      };
      await atomicWrite(this.app, sidecarPath(self.id), JSON.stringify(side));
      this.sidecar = side;
      this.basedOnDirty = false;
    }
  }

  private async prune(id: string): Promise<void> {
    const { adapter } = this.app.vault;
    const listing = await adapter.list(datedDir(id));
    const dated = listing.files.filter((f) => DATED_RE.test(f)).sort();
    for (const path of dated.slice(0, Math.max(0, dated.length - KEEP_DATED))) await adapter.remove(path);
  }
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.className = className;
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

/** Offers to restore an empty device from the vault backup. */
export class RestoreModal extends Modal {
  constructor(
    app: App,
    private readonly info: Snapshot,
    private readonly onRestore: () => void,
    private readonly onDecline: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const el = this.contentEl;
    el.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Restore your Allotr data?';
    const body = document.createElement('p');
    body.className = 'allotr-restore-text';
    body.textContent = `Restore your Allotr data from the vault backup (${this.info.name}, ${this.info.date}, ${this.info.accounts} accounts, ${this.info.entries} entries)?`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    row.append(
      button('Not now', 'allotr-restore-later', () => {
        this.close();
        this.onDecline();
      }),
      button('Restore', 'mod-cta allotr-restore-go', () => {
        this.close();
        this.onRestore();
      }),
    );
    el.append(title, body, row);
  }

  override onClose(): void {
    this.contentEl.replaceChildren();
  }
}

/** Shown on start when another device has written data this device has not seen. */
export class DivergenceModal extends Modal {
  constructor(
    app: App,
    private readonly other: Snapshot,
    private readonly mine: { accounts: number; entries: number },
    private readonly actions: { replace: () => void; keep: () => void; saveBoth: () => Promise<void>; closed: () => void },
  ) {
    super(app);
  }

  override onOpen(): void {
    const el = this.contentEl;
    el.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Another device has Allotr changes this one has not seen';
    const body = document.createElement('p');
    body.className = 'allotr-divergence-text';
    const { other, mine } = this;
    body.textContent =
      `${other.name} last saved ${other.accounts} accounts and ${other.entries} entries at ${other.date}. ` +
      `This device has ${mine.accounts} accounts and ${mine.entries} entries. ` +
      'The two are not merged: pick one. Until you do, this device does not write to the vault.';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
    const both = button('Save both copies', 'allotr-divergence-both', () => {
      both.disabled = true;
      void this.actions.saveBoth().then(() => {
        both.textContent = 'Saved both to the vault root';
      });
    });
    row.append(
      both,
      button('Keep mine', 'allotr-divergence-keep', () => {
        this.close();
        this.actions.keep();
      }),
      button('Replace mine', 'mod-cta allotr-divergence-replace', () => {
        this.close();
        this.actions.replace();
      }),
    );
    el.append(title, body, row);
  }

  override onClose(): void {
    this.contentEl.replaceChildren();
    this.actions.closed();
  }
}
