// Moving a ledger in and out of the plugin through the export bundle
// (architecture.md §5.1, §5.2). A bundle is imported into a fresh in-memory
// database first; the device's stored database is replaced only once that
// import has succeeded, so a refused bundle leaves the old data as it was.
import { App, Modal, Notice, type TFile } from 'obsidian';
import { noBlobStore } from './blob-store.ts';
import { LOCAL_USER, Runtime } from './runtime.ts';

const HEADERS = { 'x-allotr-client': 'web', accept: 'application/json' };

export interface LedgerSize {
  accounts: number;
  entries: number;
}

/** Accounts the user made (system accounts excluded) and entries. */
export async function ledgerSize(runtime: Runtime): Promise<LedgerSize> {
  const accounts = await runtime.db
    .selectFrom('accounts')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('user_id', '=', LOCAL_USER.id)
    .where('system_role', 'is', null)
    .executeTakeFirstOrThrow();
  const entries = await runtime.db
    .selectFrom('transactions')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('user_id', '=', LOCAL_USER.id)
    .executeTakeFirstOrThrow();
  return { accounts: Number(accounts.n), entries: Number(entries.n) };
}

/** The ledger as a JSON bundle, as `GET /v1/export?format=json` serves it. */
export async function exportBundle(runtime: Runtime): Promise<string> {
  const response = await runtime.fetch('/v1/export?format=json', { headers: HEADERS });
  if (!response.ok) throw new Error(`export failed: ${response.status} ${await response.text()}`);
  return response.text();
}

export type ImportOutcome =
  | { ok: true; counts: Record<string, number>; bytes: Uint8Array }
  | { ok: false; message: string };

function describeProblem(status: number, text: string): string {
  try {
    const problem = JSON.parse(text) as {
      title?: string;
      code?: string;
      detail?: string;
      errors?: { path?: string; code?: string; message?: string }[];
    };
    const head = [problem.code ?? problem.title ?? `HTTP ${status}`, problem.detail]
      .filter(Boolean)
      .join(': ');
    const lines = (problem.errors ?? [])
      .slice(0, 5)
      .map((e) => `${e.path ?? ''} ${e.code ?? ''} ${e.message ?? ''}`.trim());
    const more = (problem.errors?.length ?? 0) > 5 ? [`… and ${problem.errors!.length - 5} more`] : [];
    return [head, ...lines, ...more].join('\n');
  } catch {
    return `HTTP ${status}: ${text.slice(0, 300)}`;
  }
}

/** Imports a bundle into a throwaway database and returns that database's bytes. */
export async function importIntoFresh(text: string, log?: (m: string) => void): Promise<ImportOutcome> {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, message: 'The file is not JSON.' };
  }
  if (typeof body !== 'object' || body === null || (body as { format?: unknown }).format !== 'allotr.bundle')
    return { ok: false, message: 'The file is not an Allotr export (format "allotr.bundle").' };
  const fresh = await Runtime.open({ store: noBlobStore, ...(log === undefined ? {} : { log }) });
  try {
    const response = await fresh.fetch('/v1/import', {
      method: 'POST',
      headers: { ...HEADERS, 'content-type': 'application/json' },
      body: text,
    });
    const reply = await response.text();
    if (!response.ok) return { ok: false, message: describeProblem(response.status, reply) };
    const counts = JSON.parse(reply) as Record<string, number>;
    return { ok: true, counts, bytes: fresh.exportBytes() };
  } finally {
    fresh.discard();
  }
}

export function countsLine(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => typeof n === 'number' && n > 0)
    .map(([key, n]) => `${key} ${n}`)
    .join(', ');
}

/** Lists the vault's .json files, newest first; calls back with the chosen one. */
export class BundlePickerModal extends Modal {
  constructor(
    app: App,
    private readonly onPick: (file: TFile) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const el = this.contentEl;
    el.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Import an Allotr export';
    const hint = document.createElement('p');
    hint.textContent =
      'Pick the JSON file you exported from your Allotr server (Settings, Data, Export, JSON, or `allotr export --format json`). Put it anywhere in this vault first.';
    el.append(title, hint);
    const files = this.app.vault
      .getFiles()
      .filter((f) => f.extension === 'json' && !f.path.startsWith('.'))
      .sort((a, b) => b.stat.mtime - a.stat.mtime);
    if (files.length === 0) {
      const none = document.createElement('p');
      none.textContent = 'No .json files in this vault yet.';
      el.append(none);
      return;
    }
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow:auto';
    for (const file of files) {
      const button = document.createElement('button');
      button.className = 'allotr-bundle-file';
      button.style.cssText = 'text-align:left;height:auto;padding:6px 10px;white-space:normal';
      button.textContent = `${file.path} (${Math.ceil(file.stat.size / 1024)} KB)`;
      button.addEventListener('click', () => {
        this.close();
        this.onPick(file);
      });
      list.append(button);
    }
    el.append(list);
  }

  override onClose(): void {
    this.contentEl.replaceChildren();
  }
}

/** Asks before replacing the data already on this device. */
export class ReplaceConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly size: LedgerSize,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const el = this.contentEl;
    el.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Replace the Allotr data on this device?';
    const body = document.createElement('p');
    body.textContent = `This device already has ${this.size.accounts} accounts and ${this.size.entries} entries. They will be saved to a backup file in the vault, then replaced by the export. Nothing is merged.`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this.close());
    const replace = document.createElement('button');
    replace.className = 'mod-warning allotr-confirm-replace';
    replace.textContent = 'Back up and replace';
    replace.addEventListener('click', () => {
      this.close();
      this.onConfirm();
    });
    row.append(cancel, replace);
    el.append(title, body, row);
  }

  override onClose(): void {
    this.contentEl.replaceChildren();
  }
}

/** A vault path that does not exist yet: `<stem>.json`, `<stem> 2.json`, … */
export function freePath(app: App, stem: string): string {
  let path = `${stem}.json`;
  for (let i = 2; app.vault.getAbstractFileByPath(path) !== null; i++) path = `${stem} ${i}.json`;
  return path;
}

export function stamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function notice(message: string, ms = 8000): void {
  new Notice(message, ms);
}
