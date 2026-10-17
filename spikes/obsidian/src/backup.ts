// The vault is the durable copy of the ledger. The database itself lives in
// one device's IndexedDB, which can be cleared, evicted or lost, so after
// each save a JSON bundle is written to the vault: `Allotr/allotr-latest.json`
// plus one dated copy per day (the newest 30 are kept). On a device whose
// ledger is empty the plugin offers to restore from the latest file.
import { App, Modal } from 'obsidian';
import { exportBundle, ledgerSize, notice } from './migrate.ts';
import type { Runtime } from './runtime.ts';

export const BACKUP_DIR = 'Allotr';
export const LATEST_PATH = `${BACKUP_DIR}/allotr-latest.json`;
export const DATED_DIR = `${BACKUP_DIR}/backups`;
/** Kept when a restore was declined and the first new write would replace the old latest. */
export const DECLINED_PATH = `${DATED_DIR}/allotr-before-new-data.json`;
export const KEEP_DATED = 30;
const DATED_RE = /allotr-\d{4}-\d{2}-\d{2}\.json$/;

export function datedPath(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${DATED_DIR}/allotr-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

function localStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface BackupInfo {
  text: string;
  accounts: number;
  entries: number;
  date: string;
}

/** Reads the latest backup, or null when there is none or it is not a bundle. */
export async function readLatest(app: App): Promise<BackupInfo | null> {
  const { adapter } = app.vault;
  try {
    if (!(await adapter.exists(LATEST_PATH))) return null;
    const text = await adapter.read(LATEST_PATH);
    const bundle = JSON.parse(text) as { format?: unknown; accounts?: unknown[]; transactions?: unknown[] };
    if (bundle.format !== 'allotr.bundle') return null;
    const stat = await adapter.stat(LATEST_PATH);
    const date = stat === null ? 'unknown date' : localStamp(new Date(stat.mtime));
    return { text, accounts: bundle.accounts?.length ?? 0, entries: bundle.transactions?.length ?? 0, date };
  } catch {
    return null;
  }
}

export class VaultBackup {
  private runtime: Runtime | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private chain: Promise<void> = Promise.resolve();
  private lastLatest: string | null = null;
  private lastDated = '';
  private warned = false;
  /** Set when a restore was offered and declined: the old latest is kept aside on the first write. */
  private preserveOld = false;

  constructor(
    private readonly app: App,
    private readonly debounceMs = 10_000,
  ) {}

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

  schedule(): void {
    if (this.runtime === null) return;
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
    if (runtime === null) return this.chain;
    this.chain = this.chain.then(() => this.write(runtime)).catch((error: unknown) => {
      console.warn('[allotr] vault backup failed', error);
      if (!this.warned) {
        this.warned = true;
        notice(`Allotr could not write its vault backup: ${String(error)}`, 15000);
      }
    });
    return this.chain;
  }

  private async write(runtime: Runtime): Promise<void> {
    const { adapter } = this.app.vault;
    // An empty ledger is never worth a backup, and must not replace a real one.
    const size = await ledgerSize(runtime);
    if (size.accounts === 0 && size.entries === 0) return;
    const text = await exportBundle(runtime);
    const dated = datedPath();
    if (!(await adapter.exists(BACKUP_DIR))) await adapter.mkdir(BACKUP_DIR);
    if (!(await adapter.exists(DATED_DIR))) await adapter.mkdir(DATED_DIR);
    if (this.lastLatest === null && (await adapter.exists(LATEST_PATH))) {
      const old = await adapter.read(LATEST_PATH);
      if (old === text) this.lastLatest = text;
      else if (this.preserveOld) await adapter.write(DECLINED_PATH, old);
      this.preserveOld = false;
    }
    if (text !== this.lastLatest) {
      await adapter.write(LATEST_PATH, text);
      this.lastLatest = text;
    }
    if (this.lastDated !== `${dated}\n${text}`) {
      await adapter.write(dated, text);
      this.lastDated = `${dated}\n${text}`;
      await this.prune();
    }
  }

  private async prune(): Promise<void> {
    const { adapter } = this.app.vault;
    const listing = await adapter.list(DATED_DIR);
    const dated = listing.files.filter((f) => DATED_RE.test(f)).sort();
    for (const path of dated.slice(0, Math.max(0, dated.length - KEEP_DATED))) await adapter.remove(path);
  }
}

/** Offers to restore an empty device from the vault backup. */
export class RestoreModal extends Modal {
  constructor(
    app: App,
    private readonly info: BackupInfo,
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
    body.textContent = `Restore your Allotr data from the vault backup (${this.info.date}, ${this.info.accounts} accounts, ${this.info.entries} entries)?`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const later = document.createElement('button');
    later.className = 'allotr-restore-later';
    later.textContent = 'Not now';
    later.addEventListener('click', () => {
      this.close();
      this.onDecline();
    });
    const restore = document.createElement('button');
    restore.className = 'mod-cta allotr-restore-go';
    restore.textContent = 'Restore';
    restore.addEventListener('click', () => {
      this.close();
      this.onRestore();
    });
    row.append(later, restore);
    el.append(title, body, row);
  }

  override onClose(): void {
    this.contentEl.replaceChildren();
  }
}
